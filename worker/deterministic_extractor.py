#!/usr/bin/env python3
import contextlib, io, json, re, sys, math
import pymupdf as fitz
try:
    import camelot
except Exception:
    camelot = None
try:
    import pytesseract
    from PIL import Image
except Exception:
    pytesseract = None
    Image = None

# Las unidades compuestas deben evaluarse antes que sus prefijos simples
_UNIT_VALUES = ['kN/m²','kN/m2','kg/m³','kg/m3','g/cm³','g/cm3','mm','cm','km','µm','um','nm','kg','mg','lb','kN','MPa','GPa','kPa','Pa','psi','bar','°C','°F','min','ms','kJ','kW','Hz','J','W','V','A','ft','yd','in','m','g','t','N','K','s','h','d','%','pH']
UNITS = r"(?:" + '|'.join(re.escape(x) for x in sorted(_UNIT_VALUES, key=len, reverse=True)) + r")"
NUMBER = r"[-+]?\d+(?:[.,]\d+)?"
RANGE_RE = re.compile(rf"{NUMBER}\s*(?:{UNITS})?\s*(?:[-–—]|to|a)\s*{NUMBER}\s*(?:{UNITS})?", re.I)
VALUE_RE = re.compile(rf"(?<![A-Za-z0-9]){NUMBER}(?:\s*[×x]\s*10\s*[-^]?\s*\d+)?\s*(?:{UNITS})?", re.I)
STD_RE = re.compile(r"\b(?:ASTM|ISO|IRAM|EN|UNE|DIN|BS|JIS|IEC|NF|CSA|GB|ABNT|AASHTO|ACI|ASME|IEEE|CEN)\s*[- ]?[A-Z]?\s*\d+[A-Z0-9./:-]*\b", re.I)
FORMULA_RE = re.compile(r"[A-Za-zΑ-Ωα-ωρσμ][A-Za-z0-9_Α-Ωα-ωρσμ]*\s*[=≈≃≤≥<>]\s*[^.;\n]{1,240}")
SEMANTIC = {
'MATERIAL':['material','materials','materiales','sustancia','sustancias','mezcla','mezclas','cement','cemento','concrete','hormigón','hormigon','steel','acero','wood','madera','timber','aluminum','aluminio','polymer','polímero','polimero','ceramic','cerámica','ceramica','glass','vidrio','asphalt','asfalto','mortar','mortero','composite','compuesto'],
'COMPONENTE':['component','components','componente','componentes','aggregate','agregado','árido','arido','fiber','fibra','resin','resina','binder','aglomerante','filler','relleno','phase','fase','constituent','constituyente','additive','aditivo'],
'PROPIEDAD':['property','properties','propiedad','propiedades','density','densidad','strength','resistencia','stiffness','rigidez','hardness','dureza','porosity','porosidad','permeability','permeabilidad','viscosity','viscosidad','elasticity','elasticidad','conductivity','conductividad','moisture','humedad','thermal','térmica','termica','compressive','compresión','compression','tensile','tracción','tension','modulus','módulo','modulo'],
'METODO':['method','methods','método','metodo','métodos','metodos','procedure','procedimiento','test','tests','ensayo','ensayos','measurement','medición','medicion','determination','determinación','technique','técnica','protocol','protocolo','characterization','caracterización'],
'INSTRUMENTO':['instrument','instrumento','instrumentation','equipo','equipment','apparatus','aparato','machine','máquina','maquina','microscope','microscopio','spectrometer','espectrómetro','espectrometro','caliper','calibre','thermometer','termómetro','termometro','balance','balanza','sensor','probe','sonda','extensometer','extensómetro'],
'APLICACION':['application','applications','aplicación','aplicaciones','aplicacion','uso','used for','used in','se utiliza','se usa','utilizado para','utilizada para','suitable for','construction','construcción','construccion','manufacturing','fabricación','fabricacion','industry','industria'],
'COMPORTAMIENTO':['behavior','behaviour','comportamiento','increases','increase','increased','decreases','decrease','decreased','depends','dependent','depende','aumenta','incrementa','incremento','disminuye','reduce','reduces','reducción','reduccion','afecta','afectado','influye'],
'CONDICION':['condition','conditions','condición','condiciones','at ','under ','after ','before ','during ','ambient','temperature','temperatura','pressure','presión','presion','humidity','humedad','curing','curado','age','edad','pH','loading rate','velocidad de carga','test speed','velocidad de ensayo','atmosphere','atmósfera'],
'DEFINICION':['is defined as','defined as','refers to','means','se define como','se entiende como','consiste en','es un ','es una '],
'RELACION':['consists of','composed of','contains','formed by','made of','compuesto por','contiene','formado por','relación','relacion','associated with','correlated with','proportional to','inversely proportional','directly proportional','entre'],
'COMPOSICION':['composition','composición','composicion','content of','contenido de','composed of','consists of','contains','contiene','constituido por','constituida por','made of','porcentaje','percentage','proportion','proporción','ratio'],
'PROCESO':['manufacturing','fabrication','fabricación','fabricacion','production','producción','produccion','preparation','preparación','preparacion','mixing','mezclado','grinding','molienda','drying','secado','curing','curado','setting','fraguado','sinterization','sinterización','calcination','calcinación','treatment','tratamiento','processing','procesamiento'],
'COMPARACION':['compared with','compared to','in comparison with','similar to','unlike','whereas','a diferencia de','comparado con','comparada con','en comparación con','similar a','distinto de'],
'RECOMENDACION':['recommended','recommendation','should be used','should be avoided','not recommended','recomendado','recomendación','se recomienda','debe utilizarse','debe evitarse','no se recomienda'],
'LIMITACION':['limitation','limitations','limited','drawback','disadvantage','not suitable','not applicable','cannot be used','limitación','limitaciones','limitado','desventaja','no es adecuado','no resulta adecuado','no puede utilizarse'],
'DETERIORO':['degradation','deterioration','damage','failure','fracture','cracking','corrosion','wear','fatigue','chemical attack','degradación','deterioro','daño','falla','fractura','fisura','fisuración','corrosión','desgaste','fatiga','ataque químico'],
'SEGURIDAD':['safety','risk','risks','hazard','hazards','precaution','precautions','toxic','corrosive','seguridad','riesgo','riesgos','peligro','peligros','precaución','precauciones','tóxico','toxica','tóxica','corrosivo']}
KIND_MAP={'MATERIAL':'MATERIAL','COMPONENTE':'COMPONENTE','PROPIEDAD':'PROPIEDAD','METODO':'METODO','INSTRUMENTO':'INSTRUMENTO','APLICACION':'APLICACION','COMPORTAMIENTO':'COMPORTAMIENTO','CONDICION':'CONDICION','DEFINICION':'DEFINICION','RELACION':'RELACION'}

def norm_space(s): return re.sub(r'\s+',' ',s or '').strip()
def norm_num(s):
    s=s.replace('−','-').replace('–','-').replace('—','-').strip()
    if ',' in s and '.' not in s: s=s.replace(',','.')
    elif ',' in s and '.' in s and s.rfind(',')>s.rfind('.'): s=s.replace('.','').replace(',','.')
    return s
def numeric_value(s):
    m=re.search(NUMBER,s)
    if not m:return None
    try:return float(norm_num(m.group(0)))
    except:return None
def lang(text):
    t=text.lower(); es=len(re.findall(r'\b(el|la|los|las|de|del|que|una|un|para|con|se|como|mediante|propiedad|material|muestra|ensayo|resultado|puede|debe|cuando|entre)\b',t)); en=len(re.findall(r'\b(the|of|and|is|are|a|an|for|with|by|as|used|defined|property|material|sample|test|result|can|must|when|between)\b',t)); return 'mixto' if es and en else ('en' if en>es else 'es')
def doc_type(name,text):
    n=(name+' '+text[:5000]).lower()
    for pats,k in [(['datasheet','ficha técnica','ficha tecnica'],'ficha_tecnica'),(['handbook','manual','guide'],'manual'),(['astm','iso','iram','une','standard','norma','specification'],'norma'),(['thesis','tesis','dissertation'],'tesis'),(['catalog','catálogo','catalogue'],'catalogo'),(['journal','article','paper','artículo','proceedings'],'articulo'),(['book','libro','chapter','capítulo','textbook'],'libro'),(['report','informe'],'informe'),(['patent','patente'],'patente')]:
        if any(p in n for p in pats): return k
    return 'desconocido'
def bbox_center(b): return ((b[0]+b[2])/2,(b[1]+b[3])/2)
def distance(a,b):
    ax,ay=bbox_center(a); bx,by=bbox_center(b); return math.hypot(ax-bx,ay-by)
def extract_words(page):
    data=page.get_text('dict'); out=[]
    for w in page.get_text('words'):
        x0,y0,x1,y1,text,block,line,word=w[:8]; out.append({'text':text,'bbox':[x0,y0,x1,y1],'block':block,'line':line,'word':word})
    return data,out
def make_blocks(data):
    out=[]
    for bi,b in enumerate(data.get('blocks',[])):
        if b.get('type')!=0: continue
        spans=[]; texts=[]
        for line0 in b.get('lines',[]):
            for sp in line0.get('spans',[]):
                txt=sp.get('text','')
                if txt.strip(): texts.append(txt); spans.append({'text':txt,'bbox':list(sp.get('bbox',[0,0,0,0])),'size':sp.get('size',0),'flags':sp.get('flags',0),'font':sp.get('font','')})
        if texts: out.append({'id':bi,'bbox':list(b.get('bbox',[0,0,0,0])),'text':' '.join(texts),'spans':spans})
    return out
def headings(blocks):
    sizes=[s['size'] for b in blocks for s in b['spans'] if s['size']>0]; base=sorted(sizes)[max(0,int(len(sizes)*.65))] if sizes else 12; out=[]
    for b in blocks:
        f=b['spans'][0] if b['spans'] else None
        if not f: continue
        t=norm_space(b['text'])
        if len(t)>180: continue
        alpha=sum(c.isalpha() for c in t); upper=sum(c.isupper() for c in t if c.isalpha())/max(1,alpha); bold=bool(f['flags']&16) or 'bold' in f['font'].lower()
        if f['size']>=base*1.18 or bold or upper>.72 or re.match(r'^\d+(?:\.\d+)*[.)]?\s+\S+',t): out.append({'text':t,'bbox':b['bbox'],'block':b['id']})
    return out
def entity_near(line,start,end):
    candidates=[line[max(0,start-140):start],line[end:end+140]]
    for c in candidates:
        c=norm_space(c.strip(' ,:;()[]{}'))
        c=re.split(r'\b(?:is|are|was|were|has|have|with|at|under|of|for|and|or|de|del|la|el|los|las|con|a|en)\b',c,flags=re.I)[-1].strip(' ,:;')
        if 2<=len(c)<=90 and not re.fullmatch(r'[\d\W_]+',c): return c
    return ''
def token_bbox(line,ws,start,end):
    cursor=0; chosen=[]
    for w in ws:
        s=cursor; e=s+len(w['text']); cursor=e+1
        if e>=start and s<=end: chosen.append(w['bbox'])
    if not chosen: return [min(x['bbox'][0] for x in ws),min(x['bbox'][1] for x in ws),max(x['bbox'][2] for x in ws),max(x['bbox'][3] for x in ws)]
    return [min(b[0] for b in chosen),min(b[1] for b in chosen),max(b[2] for b in chosen),max(b[3] for b in chosen)]
def add(out,kind,field,entity,aspect,data,original,page,section,bbox,confidence=.8,value=None,value_text='',unit='',symbol='',context='',meta=None):
    original=norm_space(original)
    if not original:return
    out.append({'kind':kind,'field':field,'entity':entity or original,'aspect':aspect or field,'documentaryData':data or original,'originalText':original,'normalizedText':norm_space(original.lower()),'value':value,'valueText':value_text or original,'unit':unit,'symbol':symbol,'context':context or original,'page':page,'section':section or '','confidence':confidence,'evidence':{'fragment':original,'page':page,'section':section or '','bbox':bbox},'metadata':meta or {}})
def semantic_line(out,line,ws,page,section,doctype,ocr=False):
    low=line.lower(); lb=[min(w['bbox'][0] for w in ws),min(w['bbox'][1] for w in ws),max(w['bbox'][2] for w in ws),max(w['bbox'][3] for w in ws)]
    for kind,terms in SEMANTIC.items():
        for term in sorted(terms,key=len,reverse=True):
            for m in re.finditer(re.escape(term),low):
                start,end=m.start(),m.end(); original=line[max(0,start-90):min(len(line),end+180)]
                add(out,KIND_MAP.get(kind,'EVIDENCIA'),term,entity_near(line,start,end),kind.lower(),original,original,page,section,token_bbox(line,ws,start,end),.82,context=line,meta={'source':'semantic_rule','rule':term,'document_type':doctype,'ocr':ocr})
                break
            if any(f['page']==page and f['metadata'].get('rule')==term and f['metadata'].get('ocr')==ocr for f in out[-3:]): break
    patterns={'RELACION':r'\b(?:aumenta|incrementa|disminuye|reduce|depende de|influye en|afecta|correlaciona|proporcional|increase|decrease|depends on|influences|affects|correlated with|proportional to)\b[^.;\n]{0,520}','CONDICION':r'\b(?:temperatura|temperature|humedad|humidity|presión|pressure|tiempo de curado|curing time|edad|age|pH|atmosfera|atmosphere|velocidad de ensayo|test speed|loading rate)\b[^.;\n]{0,420}','COMPOSICION':r'\b(?:composición|composition|contenido de|content of|formado por|composed of|contains|contiene|porcentaje|percentage|proporción|proportion|ratio)\b[^.;\n]{0,620}','PROCESO':r'\b(?:fabricación|fabricacion|manufacturing|production|producción|preparación|preparation|mezclado|mixing|molienda|grinding|secado|drying|curado|curing|fraguado|setting|sinterización|sinterization|calcinación|calcination|tratamiento|treatment|procesamiento|processing)\b[^.;\n]{0,620}','COMPARACION':r'\b(?:comparado con|comparada con|en comparación con|similar a|a diferencia de|compared with|compared to|in comparison with|similar to|unlike|whereas)\b[^.;\n]{0,520}','RECOMENDACION':r'\b(?:se recomienda|recomendado|recomendación|debe utilizarse|debe evitarse|no se recomienda|recommended|recommendation|should be used|should be avoided|not recommended)\b[^.;\n]{0,520}','LIMITACION':r'\b(?:limitación|limitaciones|limitado|desventaja|no es adecuado|no resulta adecuado|no puede utilizarse|limitation|limitations|limited|drawback|disadvantage|not suitable|not applicable|cannot be used)\b[^.;\n]{0,520}','DETERIORO':r'\b(?:degradación|deterioro|daño|falla|fractura|fisura|fisuración|corrosión|desgaste|fatiga|ataque químico|degradation|deterioration|damage|failure|fracture|cracking|corrosion|wear|fatigue|chemical attack)\b[^.;\n]{0,520}','SEGURIDAD':r'\b(?:seguridad|riesgo|riesgos|peligro|peligros|precaución|precauciones|tóxico|tóxica|corrosivo|safety|risk|risks|hazard|hazards|precaution|precautions|toxic|corrosive)\b[^.;\n]{0,520}'}
    for kind,pat in patterns.items():
        for m in re.finditer(pat,line,flags=re.I):
            original=norm_space(m.group(0)); add(out,KIND_MAP.get(kind,'EVIDENCIA'),kind.lower(),entity_near(line,m.start(),m.end()),kind.lower(),original,original,page,section,lb,.86,context=line,meta={'source':'documentary_rule','rule':kind,'document_type':doctype,'ocr':ocr})

def extract_page(page,page_no,doctype):
    data,words=extract_words(page); blocks=make_blocks(data); hs=headings(blocks); text=page.get_text('text') or ''; ocr=False
    if not text.strip() and pytesseract and Image:
        pix=page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False); img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples); text=pytesseract.image_to_string(img,lang='spa+eng'); ocr=True
        words=[{'text':w,'bbox':[0,0,0,0],'block':0,'line':0,'word':i} for i,w in enumerate(text.split())]
    findings=[]; section=''
    lines=[norm_space(x) for x in text.splitlines() if norm_space(x)]
    heading_texts={h['text'] for h in hs}
    for b in hs:
        if b['bbox'][1] <= (page.rect.height if page.rect else 99999): section=b['text']
    for line in lines:
        ws=[w for w in words if w['text'] and w['text'] in line.split()]
        if not ws: ws=words[:1] or [{'bbox':[0,0,0,0],'text':''}]
        semantic_line(findings,line,ws,page_no,section,doctype,ocr)
        for m in STD_RE.finditer(line): add(findings,'NORMA','norma',entity_near(line,m.start(),m.end()),'norma',m.group(0),m.group(0),page_no,section,token_bbox(line,ws,m.start(),m.end()),.97,context=line,meta={'source':'standard_regex','document_type':doctype,'ocr':ocr})
        for m in RANGE_RE.finditer(line):
            raw=m.group(0); units=re.findall(UNITS,raw,re.I)
            add(findings,'MAGNITUD','range',entity_near(line,m.start(),m.end()),'range',raw,raw,page_no,section,token_bbox(line,ws,m.start(),m.end()),.94,value=numeric_value(raw),value_text=raw,unit=units[0] if units and len(units)==1 else '',context=line,meta={'source':'range_regex','document_type':doctype,'ocr':ocr})
        is_heading=line in heading_texts
        for m in VALUE_RE.finditer(line):
            raw=m.group(0).strip(); unit=re.search(UNITS,raw,re.I); bare_number=not unit and re.fullmatch(NUMBER,raw)
            if is_heading and bare_number: continue
            if bare_number and re.fullmatch(r'[-+]?\d+',raw):
                continue
            add(findings,'MAGNITUD','value',entity_near(line,m.start(),m.end()),'value',raw,raw,page_no,section,token_bbox(line,ws,m.start(),m.end()),.93,value=numeric_value(raw),value_text=raw,unit=unit.group(0) if unit else '',context=line,meta={'source':'value_regex','document_type':doctype,'ocr':ocr})
        for m in FORMULA_RE.finditer(line): add(findings,'FORMULA','formula',entity_near(line,m.start(),m.end()),'formula',m.group(0),m.group(0),page_no,section,token_bbox(line,ws,m.start(),m.end()),.95,context=line,meta={'source':'formula_regex','document_type':doctype,'ocr':ocr})
    tables=[]
    # Algunas versiones de PyMuPDF imprimen una recomendación a stdout desde find_tables().
    # La aislamos para garantizar que stdout sea exclusivamente JSON.
    if hasattr(page,'find_tables'):
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                for tb in page.find_tables().tables:
                    rows=tb.extract(); tables.append({'bbox':list(tb.bbox),'rows':rows,'source':'pymupdf'})
        except Exception: pass
    if camelot:
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                tables.extend({'bbox':[0,0,0,0],'rows':t.df.fillna('').values.tolist(),'source':'camelot_stream'} for t in camelot.read_pdf(str(page.parent.name),pages=str(page_no),flavor='stream'))
        except Exception: pass
    return {'page':page_no,'text':text,'words':words,'blocks':blocks,'headings':hs,'tables':tables,'links':page.get_links(),'images':page.get_images(full=True),'ocr':ocr},findings

def main():
    if len(sys.argv)<2: raise SystemExit('usage: deterministic_extractor.py PDF [start_page] [end_page]')
    pdf_path=sys.argv[1]; start=int(sys.argv[2]) if len(sys.argv)>2 else 1; end=int(sys.argv[3]) if len(sys.argv)>3 else start
    doc=fitz.open(pdf_path); full='\n'.join((p.get_text('text') or '') for p in doc); doctype=doc_type(pdf_path,full); pages=[]; findings=[]
    for n in range(start,min(end,len(doc))+1):
        p,fs=extract_page(doc[n-1],n,doctype); pages.append(p); findings.extend(fs)
    seen=set(); uniq=[]
    for f in findings:
        key=(f['kind'],f['originalText'],f['page'],f['evidence']['bbox'] and tuple(f['evidence']['bbox']))
        if key in seen: continue
        seen.add(key); uniq.append(f)
    print(json.dumps({'pages':pages,'findings':uniq},ensure_ascii=False))
if __name__=='__main__': main()
