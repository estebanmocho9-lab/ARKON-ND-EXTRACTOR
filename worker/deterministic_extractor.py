#!/usr/bin/env python3
import json, re, sys, math
import fitz
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

UNITS=r"(?:mm|cm|m|km|in|ft|yd|µm|um|nm|kg|g|mg|t|lb|N|kN|Pa|kPa|MPa|GPa|psi|bar|°C|°F|K|J|kJ|W|kW|V|A|Hz|s|ms|min|h|d|%|pH|g/cm³|kg/m³|kg/m3|g/cm3|kN/m²|kN/m2)"
NUMBER=r"[-+]?\d+(?:[.,]\d+)?"
RANGE_RE=re.compile(rf"{NUMBER}\s*(?:{UNITS})?\s*(?:[-–—]|to|a)\s*{NUMBER}\s*(?:{UNITS})?",re.I)
VALUE_RE=re.compile(rf"(?<![A-Za-z0-9]){NUMBER}(?:\s*[×x]\s*10\s*[-^]?\s*\d+)?\s*(?:{UNITS})?",re.I)
STD_RE=re.compile(r"\b(?:ASTM|ISO|IRAM|EN|UNE|DIN|BS|JIS|IEC|NF|CSA|GB|ABNT|AASHTO|ACI|ASME|IEEE|CEN)\s*[- ]?[A-Z]?\s*\d+[A-Z0-9./:-]*\b",re.I)
FORMULA_RE=re.compile(r"[A-Za-zΑ-Ωα-ωρσμ][A-Za-z0-9_Α-Ωα-ωρσμ]*\s*[=≈≃≤≥<>]\s*[^.;\n]{1,240}")
SEMANTIC={
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
    # Approximate character offsets against the reconstructed line while retaining real word geometry.
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
                add(out,KIND_MAP.get(kind,'EVIDENCIA') if kind in KIND_MAP else 'EVIDENCIA',term,entity_near(line,start,end),kind.lower(),original,original,page,section,token_bbox(line,ws,start,end),.82,context=line,meta={'source':'semantic_rule','rule':term,'document_type':doctype,'ocr':ocr})
                break
            if any(f['page']==page and f['metadata'].get('rule')==term and f['metadata'].get('ocr')==ocr for f in out[-3:]): break
    # Explicit relationship/condition/process blocks retain more context than a keyword hit.
    patterns={'RELACION':r'\b(?:aumenta|incrementa|disminuye|reduce|depende de|influye en|afecta|correlaciona|proporcional|increase|decrease|depends on|influences|affects|correlated with|proportional to)\b[^.;\n]{0,520}','CONDICION':r'\b(?:temperatura|temperature|humedad|humidity|presión|pressure|tiempo de curado|curing time|edad|age|pH|atmosfera|atmosphere|velocidad de ensayo|test speed|loading rate)\b[^.;\n]{0,420}','COMPOSICION':r'\b(?:composición|composition|contenido de|content of|formado por|composed of|contains|contiene|porcentaje|percentage|proporción|proportion|ratio)\b[^.;\n]{0,620}','PROCESO':r'\b(?:fabricación|fabricacion|manufacturing|production|producción|preparación|preparation|mezclado|mixing|molienda|grinding|secado|drying|curado|curing|sinterización|sinterization|calcinación|calcination|tratamiento|treatment|procesamiento|processing)\b[^.;\n]{0,620}'}
    for k,p in patterns.items():
        for m in re.finditer(p,line,flags=re.I): add(out,'EVIDENCIA',k.lower(),entity_near(line,m.start(),m.end()),k.lower(),m.group(0),m.group(0),page,section,token_bbox(line,ws,m.start(),m.end()),.78,context=line,meta={'source':'explicit_context_rule','category':k,'ocr':ocr})
    for m in STD_RE.finditer(line): add(out,'NORMA','norma',m.group(0),'estandar',m.group(0),m.group(0),page,section,token_bbox(line,ws,m.start(),m.end()),.99,context=line,meta={'source':'regex_standard'})
    occupied=[]
    for m in RANGE_RE.finditer(line):
        raw=m.group(0).strip(); occupied.append((m.start(),m.end())); add(out,'MAGNITUD','rango',entity_near(line,m.start(),m.end()),'rango',raw,raw,page,section,token_bbox(line,ws,m.start(),m.end()),.98,value=numeric_value(raw),value_text=raw,context=line,meta={'source':'regex_range'})
    for m in VALUE_RE.finditer(line):
        if any(a<=m.start()<b or a<m.end()<=b for a,b in occupied): continue
        raw=m.group(0).strip(); val=numeric_value(raw); um=re.search(r'('+UNITS+r')\s*$',raw,re.I); unit=um.group(1) if um else ''
        add(out,'MAGNITUD' if unit else 'ATRIBUTO','valor',entity_near(line,m.start(),m.end()),'valor_documental',raw,raw,page,section,token_bbox(line,ws,m.start(),m.end()),.97,value=val,value_text=raw,unit=unit,context=line,meta={'source':'regex_numeric'})
    for m in FORMULA_RE.finditer(line):
        raw=m.group(0).strip()
        if any(ch in raw for ch in '=≈≃≤≥<>'): add(out,'FORMULA','formula',entity_near(line,m.start(),m.end()),'expresion',raw,raw,page,section,token_bbox(line,ws,m.start(),m.end()),.93,symbol=re.split(r'[=≈≃≤≥<>]',raw,1)[0].strip()[:60],context=line,meta={'source':'regex_formula'})
def extract(pdf_path,start_page,end_page):
    doc=fitz.open(pdf_path); findings=[]; pages=[]; last_section=''
    for pno in range(start_page-1,min(end_page,len(doc))):
        page=doc[pno]; data,words=extract_words(page); blocks=make_blocks(data); heads=headings(blocks); page_text=page.get_text('text'); doctype=doc_type(pdf_path,page_text)
        # Section is the last heading above the current line, not merely the last heading on the page.
        images=[{'xref':im[0]} for im in page.get_images(full=True)]; links=[]
        try: links=[{k:v for k,v in l.items() if k in ('uri','from','page')} for l in page.get_links()]
        except Exception: pass
        table_payload=[]
        try:
            finder=page.find_tables()
            for ti,t in enumerate(finder.tables):
                rows=[[str(c or '') for c in row] for row in t.extract()]; table_payload.append({'index':ti,'bbox':list(t.bbox),'rows':rows})
                for ri,row in enumerate(rows):
                    for ci,cell in enumerate(row):
                        if cell.strip(): add(findings,'EVIDENCIA','tabla_celda',cell,f'fila_{ri+1}_columna_{ci+1}',cell,cell,pno+1,last_section,list(t.bbox),.98,meta={'source':'pymupdf.find_tables','table_index':ti,'row':ri,'column':ci})
        except Exception: pass
        if camelot and page_text.strip():
            try:
                for ti,t in enumerate(camelot.read_pdf(pdf_path,pages=str(pno+1),flavor='stream')):
                    for ri,row in enumerate(t.df.values.tolist()):
                        for ci,cell in enumerate(row):
                            cell=str(cell or '').strip()
                            if cell: add(findings,'EVIDENCIA','tabla_celda',cell,f'fila_{ri+1}_columna_{ci+1}',cell,cell,pno+1,last_section,[0,0,0,0],.94,meta={'source':'camelot.stream','table_index':ti,'row':ri,'column':ci})
            except Exception: pass
        for h in heads: add(findings,'ENTIDAD','encabezado',h['text'],'seccion',h['text'],h['text'],pno+1,h['text'],h['bbox'],.93,meta={'source':'layout_heading'})
        by_line={}
        for w in words: by_line.setdefault((w['block'],w['line']),[]).append(w)
        lines=[]
        for ws in by_line.values():
            ws.sort(key=lambda x:x['bbox'][0]); txt=' '.join(w['text'] for w in ws).strip()
            if txt: lines.append((min(w['bbox'][1] for w in ws),txt,ws))
        for _,line,ws in sorted(lines,key=lambda x:x[0]):
            for h in heads:
                if h['bbox'][1]<=min(w['bbox'][1] for w in ws)+1: last_section=h['text']
            semantic_line(findings,line,ws,pno+1,last_section,doctype)
        ocr_used=False
        if not page_text.strip() and pytesseract and Image:
            try:
                pix=page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False); img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples); ocr=pytesseract.image_to_string(img)
                if ocr.strip():
                    page_text=ocr; ocr_used=True; ocr_ws=[{'text':w,'bbox':[0,0,0,0],'block':0,'line':i,'word':0} for i,w in enumerate(re.findall(r'\S+',ocr))]
                    for ln in ocr.splitlines():
                        if ln.strip(): semantic_line(findings,ln,ocr_ws,pno+1,last_section,doctype,True)
                    add(findings,'EVIDENCIA','ocr_text','pagina','texto_ocr',ocr[:20000],ocr,pno+1,last_section,[0,0,page.rect.width,page.rect.height],.80,meta={'source':'tesseract_ocr'})
            except Exception: pass
        pages.append({'page':pno+1,'text':page_text,'bbox':[0,0,page.rect.width,page.rect.height],'words':words,'blocks':blocks,'headings':heads,'tables':table_payload,'links':links,'images':images,'ocr_used':ocr_used})
    doc.close()
    seen=set(); clean=[]
    for f in findings:
        key=(f['page'],f['kind'],f['field'],f['entity'],f['originalText'],f['metadata'].get('source'),f['metadata'].get('rule'))
        if key not in seen: seen.add(key); clean.append(f)
    return {'pages':pages,'findings':clean}
def main():
    if len(sys.argv)<4: print('usage: deterministic_extractor.py PDF START END',file=sys.stderr); sys.exit(2)
    print(json.dumps(extract(sys.argv[1],int(sys.argv[2]),int(sys.argv[3])),ensure_ascii=False,separators=(',',':')))
if __name__=='__main__': main()
