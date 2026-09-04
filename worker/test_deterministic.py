import json
import subprocess
import tempfile
from pathlib import Path
import pymupdf as fitz

with tempfile.TemporaryDirectory() as td:
    pdf_path=Path(td)/'fixture.pdf'
    doc=fitz.open()
    page=doc.new_page(width=612,height=792)
    page.insert_text((60,80),'3. Materiales')
    page.insert_text((60,120),'El cemento Portland presenta una densidad aparente de 1,20 g/cm3 a 20 °C.')
    page.insert_text((60,150),'El ensayo se realiza según ASTM C188.')
    page.insert_text((60,180),'rho = m / V')
    doc.save(pdf_path)
    doc.close()

    p=subprocess.run(['python3','worker/deterministic_extractor.py',str(pdf_path),'1','1'],capture_output=True,text=True,check=True)
    assert not p.stderr.strip(), p.stderr
    result=json.loads(p.stdout)
    assert len(result['pages'])==1
    assert result['pages'][0]['text'].strip()
    assert result['pages'][0]['words']
    assert any(x['kind']=='NORMA' and 'ASTM' in x['originalText'] for x in result['findings'])
    assert any(x['kind']=='MAGNITUD' and x.get('unit')=='g/cm3' for x in result['findings'])
    assert any(x['kind']=='MAGNITUD' and x.get('unit')=='°C' for x in result['findings'])
    assert not any(x['kind']=='MAGNITUD' and x['originalText']=='3' and x['page']==1 for x in result['findings'])
    assert any(x['kind']=='FORMULA' for x in result['findings'])
    print('ND_DETERMINISTIC_SELFTEST_OK',len(result['findings']))
