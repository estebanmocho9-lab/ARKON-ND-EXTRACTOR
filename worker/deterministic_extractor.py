#!/usr/bin/env python3
import json, re, sys, math
from pathlib import Path

import fitz  # PyMuPDF

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

UNITS = r"(?:mm|cm|m|km|in|ft|yd|µm|um|nm|kg|g|mg|t|lb|N|kN|Pa|kPa|MPa|GPa|psi|bar|°C|°F|K|J|kJ|W|kW|V|A|Hz|s|ms|min|h|d|%|pH|g/cm³|kg/m³|kg/m3|g/cm3|MPa|kN/m²|kN/m2)"
VALUE_RE = re.compile(r"(?<![A-Za-z0-9])[-+]?\d+(?:[.,]\d+)?(?:\s*[×x]\s*10\s*[-^]?\s*\d+)?(?:\s*[-–—]\s*[-+]?\d+(?:[.,]\d+)?)?\s*(?:" + UNITS + r")?", re.I)
RANGE_RE = re.compile(r"[-+]?\d+(?:[.,]\d+)?\s*(?:" + UNITS + r")?\s*(?:[-–—]|to|a)\s*[-+]?\d+(?:[.,]\d+)?\s*(?:" + UNITS + r")?", re.I)
STD_RE = re.compile(r"\b(?:ASTM|ISO|EN|DIN|UNE|AASHTO|ACI|ASME|IEEE|IEC|NF|BS|CSA|CEN)\s*[- ]?[A-Z]?\s*\d+[A-Z0-9./-]*\b", re.I)
FORMULA_RE = re.compile(r"(?:[A-Za-zΑ-Ωα-ωρσμ]+\s*[=≈≃≤≥<>]\s*[^.;]{1,120}(?:[+\-*/^²³√Σ∫]|\d|[A-Za-zΑ-Ωα-ωρσμ])[^.;]{0,120})")
KEYWORDS = {
    'MATERIAL': ['cement','concrete','steel','wood','timber','aluminum','aluminium','polymer','ceramic','glass','asphalt','mortar','cemento','hormigón','hormigon','acero','madera','aluminio','polímero','polimero','cerámica','ceramica','vidrio','asfalto','mortero'],
    'COMPONENTE': ['component','componente','aggregate','agregado','fiber','fibra','resin','resina','binder','aglomerante'],
    'PROPIEDAD': ['density','densidad','strength','resistencia','stiffness','rigidez','hardness','dureza','porosity','porosidad','permeability','permeabilidad','viscosity','viscosidad','ph','pH','moisture','humedad','elasticity','elasticidad','conductivity','conductividad','thermal','térmica','termica'],
    'METODO': ['method','método','metodo','test','ensayo','testing','measurement','medición','medicion','procedure','procedimiento','calibration','calibración','calibracion'],
    'INSTRUMENTO': ['instrument','instrumento','microscope','microscopio','spectrometer','espectrómetro','espectrometro','caliper','calibre','thermometer','termómetro','termometro','scale','balanza','sensor','machine','máquina','maquina'],
    'APLICACION': ['used for','used in','application','aplicación','aplicacion','uso','construction','construcción','construccion','bridge','puente','building','edificio','pavement','pavimento'],
    'COMPORTAMIENTO': ['increases','decreases','increased','decreased','depends','dependent','behavior','behaviour','comportamiento','aumenta','disminuye','depende','reduce','reduces','increases with','decreases with'],
    'CONDICION': ['at ','under ','after ','before ','during ','ambient','temperature','pressure','humidity','curing','curado','condición','condicion','requirement','requisito'],
    'DEFINICION': ['is defined as','defined as','refers to','means','se define como','se entiende como','consiste en','is a ','es un ','es una '],
    'RELACION': ['consists of','composed of','contains','contains','formed by','made of','compuesto por','contiene','formado por','relación','relacion','between'],
}

def norm_num(s):
    s = s.replace('−','-').replace('–','-').replace('—','-').strip()
    # Spanish decimal comma; avoid converting thousands separators incorrectly.
    if ',' in s and '.' not in s:
        s = s.replace(',', '.')
    elif ',' in s and '.' in s and s.rfind(',') > s.rfind('.'):
        s = s.replace('.', '').replace(',', '.')
    return s

def numeric_parts(text):
    m = re.search(r"[-+]?\d+(?:[.,]\d+)?", text)
    if not m:
        return None
    try:
        return float(norm_num(m.group(0)))
    except Exception:
        return None

def bbox_center(b):
    return ((b[0]+b[2])/2.0, (b[1]+b[3])/2.0)

def distance(a,b):
    ax,ay=bbox_center(a); bx,by=bbox_center(b)
    return math.hypot(ax-bx, ay-by)

def span_words(page):
    data = page.get_text('dict')
    words = page.get_text('words')
    out=[]
    for w in words:
        x0,y0,x1,y1,text,block,line,word = w[:8]
        out.append({'text':text,'bbox':[x0,y0,x1,y1],'block':block,'line':line,'word':word})
    return data, out

def make_blocks(data):
    blocks=[]
    for bi,b in enumerate(data.get('blocks',[])):
        if b.get('type') != 0: continue
        spans=[]; texts=[]
        for line in b.get('lines',[]):
            for sp in line.get('spans',[]):
                txt=sp.get('text','')
                if txt.strip():
                    texts.append(txt)
                    spans.append({'text':txt,'bbox':list(sp.get('bbox',[0,0,0,0])),'size':sp.get('size',0),'flags':sp.get('flags',0),'font':sp.get('font','')})
        if texts:
            blocks.append({'id':bi,'bbox':list(b.get('bbox',[0,0,0,0])),'text':' '.join(texts),'spans':spans})
    return blocks

def headings(blocks):
    sizes=[sp['size'] for b in blocks for sp in b['spans'] if sp['size']>0]
    base=sorted(sizes)[max(0,int(len(sizes)*0.65))] if sizes else 12
    hs=[]
    for b in blocks:
        first=b['spans'][0] if b['spans'] else None
        if not first: continue
        t=b['text'].strip()
        if len(t)>180: continue
        upper_ratio=sum(c.isupper() for c in t if c.isalpha())/max(1,sum(c.isalpha() for c in t))
        bold=bool(first['flags'] & 16) or 'bold' in first['font'].lower()
        if first['size']>=base*1.18 or bold or upper_ratio>0.72 or re.match(r'^\d+(?:\.\d+)*[.)]?\s+\S+',t):
            hs.append({'text':t,'bbox':b['bbox'],'block':b['id']})
    return hs

def context_for(text, start, end, radius=220):
    a=max(0,start-radius); b=min(len(text),end+radius)
    return text[a:b].strip()

def entity_near(line, token_start, token_end):
    left=line[:token_start].strip(' ,:;()[]{}')
    right=line[token_end:].strip(' ,:;()[]{}')
    # Prefer nearby noun phrase before the detected item, then after it.
    cand=[]
    for s in [left[-100:], right[:100]]:
        s=re.sub(r'\s+',' ',s).strip()
        if s: cand.append(s)
    for c in cand:
        c=re.split(r'\b(?:is|are|was|were|has|have|with|at|under|of|for|and|or|de|del|la|el|los|las|con|a|en)\b',c,flags=re.I)[-1].strip(' ,:;')
        if 2<=len(c)<=90 and not re.fullmatch(r'[\d\W_]+',c): return c
    return ''

def add_finding(out, kind, field, entity, aspect, data, original, page_no, section, bbox, confidence=0.8, value=None, value_text='', unit='', symbol='', context='', meta=None):
    if not original.strip(): return
    out.append({'kind':kind,'field':field,'entity':entity or original.strip(),'aspect':aspect or field,'documentaryData':data or original.strip(),'originalText':original.strip(),'normalizedText':re.sub(r'\s+',' ',original.strip()),'value':value,'valueText':value_text or original.strip(),'unit':unit,'symbol':symbol,'context':context or original.strip(),'page':page_no,'section':section or '','confidence':confidence,'evidence':{'fragment':original.strip(),'page':page_no,'section':section or '','start':int(bbox[0]),'end':int(bbox[1]),'end':int(bbox[2])},'metadata':meta or {}})

def extract(pdf_path, start_page, end_page):
    doc=fitz.open(pdf_path)
    findings=[]; pages=[]
    for pno in range(start_page-1, min(end_page, len(doc))):
        page=doc[pno]
        data, words=span_words(page)
        blocks=make_blocks(data)
        heads=headings(blocks)
        page_text=page.get_text('text')
        section=''
        for h in heads:
            section=h['text']
        # Complete page map: words, blocks, links and images.
        images=[]
        for im in page.get_images(full=True):
            try: images.append({'xref':im[0]})
            except Exception: pass
        links=[]
        try:
            links=[{k:v for k,v in l.items() if k in ('uri','from','page')} for l in page.get_links()]
        except Exception: pass
        table_payload=[]
        try:
            finder=page.find_tables()
            for ti,t in enumerate(finder.tables):
                rows=[]
                for row in t.extract(): rows.append([str(c or '') for c in row])
                table_payload.append({'index':ti,'bbox':list(t.bbox),'rows':rows})
                for ri,row in enumerate(rows):
                    for ci,cell in enumerate(row):
                        if cell.strip():
                            add_finding(findings,'EVIDENCIA','tabla_celda',cell,f'fila_{ri+1}_columna_{ci+1}',cell,cell,pno+1,section,list(t.bbox),0.98,meta={'source':'pymupdf.find_tables','table_index':ti,'row':ri,'column':ci})
        except Exception:
            pass
        # Camelot second table engine; keep only textual tables and never replace PyMuPDF output.
        if camelot and page_text.strip():
            try:
                tables=camelot.read_pdf(pdf_path,pages=str(pno+1),flavor='stream')
                for ti,t in enumerate(tables):
                    df=t.df
                    rows=df.values.tolist()
                    for ri,row in enumerate(rows):
                        for ci,cell in enumerate(row):
                            cell=str(cell or '').strip()
                            if cell:
                                add_finding(findings,'EVIDENCIA','tabla_celda',cell,f'fila_{ri+1}_columna_{ci+1}',cell,cell,pno+1,section,[0,0,0,0],0.94,meta={'source':'camelot.stream','table_index':ti,'row':ri,'column':ci})
            except Exception:
                pass
        # Headings become explicit documentary entities.
        for h in heads:
            add_finding(findings,'ENTIDAD','encabezado',h['text'],'seccion',h['text'],h['text'],pno+1,h['text'],h['bbox'],0.93,meta={'source':'layout_heading'})
        # Atomic line-level semantic rules + geometry.
        lines=[]
        by_line={}
        for w in words:
            by_line.setdefault((w['block'],w['line']),[]).append(w)
        for key,ws in by_line.items():
            ws.sort(key=lambda x:x['bbox'][0]); txt=' '.join(w['text'] for w in ws).strip()
            if txt: lines.append((txt,ws))
        for line,ws in lines:
            lb=[min(w['bbox'][0] for w in ws),min(w['bbox'][1] for w in ws),max(w['bbox'][2] for w in ws),max(w['bbox'][3] for w in ws)]
            lower=line.lower()
            for kind,terms in KEYWORDS.items():
                for term in terms:
                    pos=lower.find(term.lower())
                    if pos<0: continue
                    phrase=line[max(0,pos-80):min(len(line),pos+120)].strip()
                    add_finding(findings,kind,term,entity_near(line,pos,pos+len(term)),term,phrase,phrase,pno+1,section,lb,0.84,meta={'source':'deterministic_keyword','keyword':term})
                    break
            # Standards.
            for m in STD_RE.finditer(line):
                add_finding(findings,'NORMA','norma',m.group(0),'estandar',m.group(0),m.group(0),pno+1,section,lb,0.99,meta={'source':'regex_standard'})
            # Numeric/range atoms.
            for m in VALUE_RE.finditer(line):
                raw=m.group(0).strip()
                if not raw: continue
                val=numeric_parts(raw)
                unit=''
                um=re.search(r'(' + UNITS + r')\s*$',raw,re.I)
                if um: unit=um.group(1)
                kind='MAGNITUD' if unit or val is not None else 'ATRIBUTO'
                aspect='valor_documental'
                entity=entity_near(line,m.start(),m.end())
                add_finding(findings,kind,'valor',entity,aspect,raw,raw,pno+1,section,lb,0.97,value=val,value_text=raw,unit=unit,context=line,meta={'source':'regex_numeric','bbox_line':lb})
            # Formula candidates.
            for m in FORMULA_RE.finditer(line):
                raw=m.group(0).strip()
                if '=' not in raw and '≤' not in raw and '≥' not in raw: continue
                add_finding(findings,'FORMULA','formula',entity_near(line,m.start(),m.end()),'expresion',raw,raw,pno+1,section,lb,0.90,symbol=raw.split('=')[0].strip()[:40],context=line,meta={'source':'regex_formula'})
        # OCR fallback only for pages with no text. It is local and free.
        ocr_used=False
        if not page_text.strip() and pytesseract and Image:
            try:
                pix=page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False)
                img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
                ocr=pytesseract.image_to_string(img)
                if ocr.strip():
                    page_text=ocr; ocr_used=True
                    add_finding(findings,'EVIDENCIA','ocr_text','pagina','texto_ocr',ocr[:20000],ocr,pno+1,section,[0,0,page.rect.width,page.rect.height],0.80,meta={'source':'tesseract_ocr'})
            except Exception:
                pass
        pages.append({'page':pno+1,'text':page_text,'bbox':[0,0,page.rect.width,page.rect.height],'words':words,'blocks':blocks,'headings':heads,'tables':table_payload,'links':links,'images':images,'ocr_used':ocr_used})
    doc.close()
    # Deduplicate exact repeated findings while preserving source metadata.
    seen=set(); clean=[]
    for f in findings:
        key=(f['page'],f['kind'],f['field'],f['entity'],f['originalText'])
        if key in seen: continue
        seen.add(key); clean.append(f)
    return {'pages':pages,'findings':clean}

def main():
    if len(sys.argv)<4:
        print('usage: deterministic_extractor.py PDF START END',file=sys.stderr); sys.exit(2)
    result=extract(sys.argv[1],int(sys.argv[2]),int(sys.argv[3]))
    print(json.dumps(result,ensure_ascii=False,separators=(',',':')))

if __name__=='__main__': main()
