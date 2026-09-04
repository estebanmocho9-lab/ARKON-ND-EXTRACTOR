import { google } from 'googleapis';
import fs from 'node:fs';
import type { NDKind, NDFinding } from './types';

const TABS=['DOCUMENTO','PAGINAS','HALLAZGOS_RAW','MATERIALES','COMPONENTES','PROPIEDADES','MAGNITUDES','ATRIBUTOS','RELACIONES','CONDICIONES','METODOS','INSTRUMENTOS','APLICACIONES','COMPORTAMIENTOS','NORMAS','DEFINICIONES','EVIDENCIAS','FORMULAS','ENTIDADES_DOCUMENTALES','ND_TEXT_PARTES'];
const HEAD=['drive_id','documento','tipo','campo','entidad','aspecto','dato_documental','texto_original','texto_normalizado','valor','valor_texto','unidad','simbolo','contexto','pagina','seccion','confianza','evidencia_json','metadatos_json'];
const PAGE_HEAD=['drive_id','documento','pagina','parte','total_partes','texto_completo','bbox_json','words_json','blocks_json','headings_json','tables_json','links_json','images_json','ocr_usado'];
const TEXT_PART_HEAD=['drive_id','documento','origen','clave','campo','pagina','parte','total_partes','texto'];
const KIND_TO_TAB:Record<NDKind,string>={MATERIAL:'MATERIALES',COMPONENTE:'COMPONENTES',PROPIEDAD:'PROPIEDADES',MAGNITUD:'MAGNITUDES',ATRIBUTO:'ATRIBUTOS',RELACION:'RELACIONES',CONDICION:'CONDICIONES',METODO:'METODOS',INSTRUMENTO:'INSTRUMENTOS',APLICACION:'APLICACIONES',COMPORTAMIENTO:'COMPORTAMIENTOS',NORMA:'NORMAS',DEFINICION:'DEFINICIONES',EVIDENCIA:'EVIDENCIAS',FORMULA:'FORMULAS',ENTIDAD:'ENTIDADES_DOCUMENTALES'};
const CELL_LIMIT=45_000;

function getAuth(){const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();if(raw){const c=JSON.parse(raw);return new google.auth.GoogleAuth({credentials:{client_email:c.client_email,private_key:c.private_key},scopes:['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets']});}const p=process.env.GOOGLE_CREDENTIALS_PATH?.trim();if(!p)throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_CREDENTIALS_PATH');if(!fs.existsSync(p))throw new Error(`No existe GOOGLE_CREDENTIALS_PATH: ${p}`);const c=JSON.parse(fs.readFileSync(p,'utf8'));return new google.auth.GoogleAuth({credentials:{client_email:c.client_email,private_key:c.private_key},scopes:['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets']});}
const sheets=google.sheets({version:'v4',auth:getAuth()});const ensured=new Set<string>();
function chunks(s:string){const out:string[]=[];for(let i=0;i<s.length;i+=CELL_LIMIT)out.push(s.slice(i,i+CELL_LIMIT));return out.length?out:[''];}
function json(v:any){try{return JSON.stringify(v??{})}catch{return '{}'}}
async function appendBatch(id:string,range:string,values:any[][],size=50){for(let i=0;i<values.length;i+=size){const b=values.slice(i,i+size);if(b.length)await sheets.spreadsheets.values.append({spreadsheetId:id,range,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:b}});}}
function normalizeKind(kind:string):NDKind|''{const k=String(kind||'').trim().toUpperCase();const aliases:Record<string,NDKind>={PROPERTY:'PROPIEDAD',MAGNITUDE:'MAGNITUD',DEFINITION:'DEFINICION',COMPONENT:'COMPONENTE',RELATION:'RELACION',CONDITION:'CONDICION',REQUIREMENT:'CONDICION',METHOD:'METODO',INSTRUMENT:'INSTRUMENTO',APPLICATION:'APLICACION',BEHAVIOR:'COMPORTAMIENTO',STANDARD:'NORMA',NORM:'NORMA',FORMULA:'FORMULA',EVIDENCE:'EVIDENCIA',ATTRIBUTE:'ATRIBUTO',ENTITY:'ENTIDAD'};return (KIND_TO_TAB[k as NDKind]?k as NDKind:aliases[k]||'');}
function rows(doc:string,id:string,findings:NDFinding[]){return findings.map(h=>[id,doc,h.kind,h.field,h.entity,h.aspect,h.documentaryData,h.originalText,h.normalizedText,h.value??'',h.valueText??'',h.unit??'',h.symbol??'',h.context,h.page,h.section??'',h.confidence,json(h.evidence),json(h.metadata||{})]);}
function unifiedRow(doc:string,h:NDFinding){const kind=normalizeKind(h.kind),m:any=h.metadata||{},ev:any=h.evidence||{},text=String(h.originalText||h.documentaryData||h.normalizedText||'').trim(),name=String(h.entity||h.field||h.normalizedText||text).trim();const cat=kind==='PROPIEDAD'?'Propiedad':kind==='MATERIAL'?'Material':kind==='COMPONENTE'?'Componente':kind==='METODO'?'Método':kind==='INSTRUMENTO'?'Instrumento':kind==='NORMA'?'Norma':kind==='CONDICION'?'Condición':kind==='RELACION'?'Relación':kind==='FORMULA'?'Fórmula':kind==='DEFINICION'?'Definición':kind==='APLICACION'?'Aplicación':kind==='COMPORTAMIENTO'?'Comportamiento':kind||h.kind||'';return [name,String(m.english||m.nombre_ingles||'').trim(),String(m.synonyms||m.sinonimos||'').trim()||'-',cat,String(h.aspect||m.property_type||m.tipo_propiedad||'-'),String(m.family||m.familia||'').trim()||'-',String(m.subfamily||m.subfamilia||'').trim()||'-',String(m.material||'').trim()||'-',String(m.component||m.componente||'').trim()||'-',h.unit||'',h.symbol||'',h.value??h.valueText??'',m.min??m.valor_min??'',m.max??m.valor_max??'',String(m.condition||m.condicion||'').trim(),String(m.method||m.metodo||'').trim(),String(m.instrument||m.instrumento||'').trim(),String(m.standard||m.norma||'').trim(),String(m.formula||m.equation||m.ecuacion||'').trim()||(kind==='FORMULA'?text:''),String(m.relation||m.relacion||'').trim(),h.confidence||'',String(m.origin||m.origen||'').trim()||'Tabla',doc,h.page??'',String(h.section||m.chapter||m.capitulo||'').trim()||'-',json({field:h.field,context:h.context,evidence:ev,metadata:m})];}
async function ensure(id:string){if(ensured.has(id))return;const m=await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets.properties'});const have=new Set((m.data.sheets||[]).map(s=>s.properties?.title));const req=TABS.filter(t=>!have.has(t)).map(title=>({addSheet:{properties:{title}}}));if(req.length)await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests:req}});const data=[{range:'DOCUMENTO!A1:D1',values:[['drive_id','documento','estado','hallazgos_total']]},{range:'PAGINAS!A1:N1',values:[PAGE_HEAD]},{range:'ND_TEXT_PARTES!A1:I1',values:[TEXT_PART_HEAD]},...TABS.filter(t=>!['DOCUMENTO','PAGINAS','ND_TEXT_PARTES'].includes(t)).map(t=>({range:`${t}!A1:S1`,values:[HEAD]}))];await sheets.spreadsheets.values.batchUpdate({spreadsheetId:id,requestBody:{valueInputOption:'RAW',data}});ensured.add(id);}
export async function getOrCreateSheet(_driveId:string,_name:string){const fixed=process.env.GOOGLE_SHEETS_ID?.trim();if(!fixed)throw new Error('Falta GOOGLE_SHEETS_ID: se requiere el Spreadsheet de salida ND');await ensure(fixed);return fixed;}

async function appendSafeRow(id:string,range:string,row:any[],origin:string,docId:string,docName:string,page:number|string,stableKey:string){
  const copy=[...row];
  for(let i=0;i<copy.length;i++){
    if(typeof copy[i]!=='string'||copy[i].length<=CELL_LIMIT)continue;
    const value=copy[i];
    const parts=chunks(value);
    const key=`${stableKey}:c${i}`;
    await appendBatch(id,'ND_TEXT_PARTES!A1',parts.map((part,n)=>[docId,docName,origin,key,range.split('!')[0],page,n+1,parts.length,part]),20);
    copy[i]=`[ND_TEXT_PARTES key=${key} partes=${parts.length}]`;
  }
  await appendBatch(id,range,[copy],1);
}

export async function appendPages(id:string,driveId:string,name:string,pages:any[]){
  for(const p of pages){
    const row=[driveId,name,p.page,1,1,String(p.text||''),json(p.bbox||[]),json(p.words||[]),json(p.blocks||[]),json(p.headings||[]),json(p.tables||[]),json(p.links||[]),json(p.images||[]),p.ocr_used?'SI':'NO'];
    const textParts=chunks(String(p.text||''));
    for(let i=0;i<textParts.length;i++){
      const r=[...row];r[3]=i+1;r[4]=textParts.length;r[5]=textParts[i];
      await appendSafeRow(id,'PAGINAS!A1',r,'PAGINAS',driveId,name,p.page,`${driveId}:p${p.page}:part${i+1}`);
    }
  }
}

async function appendFindingRows(id:string,origin:string,docId:string,name:string,findings:NDFinding[],tab:string){
  const base=rows(name,docId,findings);
  for(let i=0;i<base.length;i++)await appendSafeRow(id,`${tab}!A1`,base[i],origin,docId,name,findings[i].page,`${docId}:p${findings[i].page}:f${i}:${origin}`);
}

export async function appendFindings(id:string,driveId:string,name:string,findings:NDFinding[]){
  if(!findings.length)return;
  const normalized:NDFinding[]=findings.map(h=>{const kind=normalizeKind(h.kind);return kind?{...h,kind}:h;});
  await appendFindingRows(id,'HALLAZGOS_RAW',driveId,name,normalized,'HALLAZGOS_RAW');
  for(const kind of Object.keys(KIND_TO_TAB) as NDKind[]){const tab=KIND_TO_TAB[kind];const subset=normalized.filter(x=>x.kind===kind);if(subset.length)await appendFindingRows(id,tab,driveId,name,subset,tab);}
  for(let i=0;i<normalized.length;i++)await appendSafeRow(id,'Hoja 1!A1',unifiedRow(name,normalized[i]),'Hoja 1',driveId,name,normalized[i].page,`${driveId}:p${normalized[i].page}:u${i}`);
}
export async function setDocumentStatus(id:string,driveId:string,name:string,status:string,total:number){await sheets.spreadsheets.values.update({spreadsheetId:id,range:'DOCUMENTO!A2:D2',valueInputOption:'RAW',requestBody:{values:[[driveId,name,status,total]]}});}
