import { google } from 'googleapis';
import fs from 'node:fs';
import type { NDFinding } from './types';

const TABS=['DOCUMENTO','PAGINAS','HALLAZGOS_RAW','MATERIALES','COMPONENTES','PROPIEDADES','MAGNITUDES','ATRIBUTOS','RELACIONES','CONDICIONES','METODOS','INSTRUMENTOS','APLICACIONES','COMPORTAMIENTOS','NORMAS','DEFINICIONES','EVIDENCIAS','FORMULAS','ENTIDADES_DOCUMENTALES'];
const HEAD=['drive_id','documento','tipo','campo','entidad','aspecto','dato_documental','texto_original','texto_normalizado','valor','valor_texto','unidad','simbolo','contexto','pagina','seccion','confianza','evidencia_json','metadatos_json'];
const PAGE_HEAD=['drive_id','documento','pagina','texto_completo','bbox_json','words_json','blocks_json','headings_json','tables_json','links_json','images_json','ocr_usado'];
const UNIFIED_HEAD=['Nombre exacto','Nombre en inglés','Sinónimos','Categoría','Tipo de propiedad','Familia','Subfamilia','Material','Componente','Unidad','Símbolo','Valor encontrado','Valor mín','Valor máx','Condición de ensayo','Método de ensayo','Instrumento','Norma','Ecuación o fórmula asociada','Relación con otras propiedades','Nivel de confianza','Origen del dato','Documento','Página','Capítulo','Observaciones'];
const KIND_TO_TAB:any={MATERIAL:'MATERIALES',COMPONENTE:'COMPONENTES',PROPIEDAD:'PROPIEDADES',MAGNITUD:'MAGNITUDES',ATRIBUTO:'ATRIBUTOS',RELACION:'RELACIONES',CONDICION:'CONDICIONES',METODO:'METODOS',INSTRUMENTO:'INSTRUMENTOS',APLICACION:'APLICACIONES',COMPORTAMIENTO:'COMPORTAMIENTOS',NORMA:'NORMAS',DEFINICION:'DEFINICIONES',EVIDENCIA:'EVIDENCIAS',FORMULA:'FORMULAS',ENTIDAD:'ENTIDADES_DOCUMENTALES'};

function getAuth(){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if(raw){const c=JSON.parse(raw);return new google.auth.GoogleAuth({credentials:{client_email:c.client_email,private_key:c.private_key},scopes:['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets']});}
  const credentialsPath=process.env.GOOGLE_CREDENTIALS_PATH?.trim();
  if(!credentialsPath) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_CREDENTIALS_PATH');
  if(!fs.existsSync(credentialsPath)) throw new Error(`No existe GOOGLE_CREDENTIALS_PATH: ${credentialsPath}`);
  const c=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
  return new google.auth.GoogleAuth({credentials:{client_email:c.client_email,private_key:c.private_key},scopes:['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets']});
}
const auth=getAuth();
const sheets=google.sheets({version:'v4',auth});
const drive=google.drive({version:'v3',auth});
const ensured=new Set<string>();

function rows(doc:string,id:string,findings:NDFinding[]){return findings.map(h=>[id,doc,h.kind,h.field,h.entity,h.aspect,h.documentaryData,h.originalText,h.normalizedText,h.value??'',h.valueText??'',h.unit??'',h.symbol??'',h.context,h.page,h.section??'',h.confidence,JSON.stringify(h.evidence),JSON.stringify(h.metadata||{})]);}

function normalizeKind(kind:string):string{const k=String(kind||'').trim().toUpperCase();if(KIND_TO_TAB[k])return k;if(k==='PROPERTY')return'PROPIEDAD';if(k==='MAGNITUDE')return'MAGNITUD';if(k==='DEFINITION')return'DEFINICION';if(k==='COMPONENT')return'COMPONENTE';if(k==='RELATION')return'RELACION';if(k==='CONDITION'||k==='REQUIREMENT')return'CONDICION';if(k==='METHOD')return'METODO';if(k==='INSTRUMENT')return'INSTRUMENTO';if(k==='APPLICATION')return'APLICACION';if(k==='BEHAVIOR')return'COMPORTAMIENTO';if(k==='STANDARD'||k==='NORM')return'NORMA';if(k==='FORMULA')return'FORMULA';if(k==='EVIDENCE')return'EVIDENCIA';if(k==='ATTRIBUTE')return'ATRIBUTO';if(k==='ENTITY')return'ENTIDAD';return'';}

function unifiedRow(doc:string,h:NDFinding){
  const kind=normalizeKind(h.kind);
  const category=kind==='PROPIEDAD'?'Propiedad':kind==='MATERIAL'?'Material':kind==='COMPONENTE'?'Componente':kind==='METODO'?'Método':kind==='INSTRUMENTO'?'Instrumento':kind==='NORMA'?'Norma':kind==='CONDICION'?'Condición':kind==='RELACION'?'Relación':kind==='FORMULA'?'Fórmula':kind==='DEFINICION'?'Definición':kind==='APLICACION'?'Aplicación':kind==='COMPORTAMIENTO'?'Comportamiento':kind||h.kind||'';
  const meta:any=h.metadata||{};
  const ev:any=h.evidence||{};
  const text=String(h.originalText||h.documentaryData||h.normalizedText||'').trim();
  const name=String(h.entity||h.field||h.normalizedText||text).trim();
  const english=String(meta.english||meta.nombre_ingles||'').trim();
  const synonyms=String(meta.synonyms||meta.sinonimos||'').trim()||'-';
  const family=String(meta.family||meta.familia||'').trim()||'-';
  const subfamily=String(meta.subfamily||meta.subfamilia||'').trim()||'-';
  const material=String(meta.material||'').trim()||'-';
  const component=String(meta.component||meta.componente||'').trim()||'-';
  const min=meta.min??meta.valor_min??''; const max=meta.max??meta.valor_max??'';
  const condition=String(meta.condition||meta.condicion||'').trim()||'';
  const method=String(meta.method||meta.metodo||'').trim()||'';
  const instrument=String(meta.instrument||meta.instrumento||'').trim()||'';
  const standard=String(meta.standard||meta.norma||'').trim()||'';
  const formula=String(meta.formula||meta.equation||meta.ecuacion||'').trim()||(kind==='FORMULA'?text:'');
  const relation=String(meta.relation||meta.relacion||'').trim()||'';
  const origin=String(meta.origin||meta.origen||'').trim()||'Tabla';
  const chapter=String(h.section||meta.chapter||meta.capitulo||'').trim()||'-';
  const observations=JSON.stringify({field:h.field,context:h.context,evidence:ev,metadata:meta});
  return [name,english,synonyms,category,String(h.aspect||meta.property_type||meta.tipo_propiedad||'-'),family,subfamily,material,component,h.unit||'',h.symbol||'',h.value??h.valueText??'',min,max,condition,method,instrument,standard,formula,relation,h.confidence||'',origin,doc,h.page??'',chapter,observations];
}

async function ensure(id:string){
  if(ensured.has(id)) return;
  const m=await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets.properties'});
  const have=new Set((m.data.sheets||[]).map(s=>s.properties?.title));
  const requests=TABS.filter(t=>!have.has(t)).map(t=>({addSheet:{properties:{title:t}}}));
  if(requests.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests}});
  const data=[{range:'DOCUMENTO!A1:D1',values:[['drive_id','documento','estado','hallazgos_total']]},{range:'PAGINAS!A1:L1',values:[PAGE_HEAD]},...TABS.filter(t=>t!=='DOCUMENTO'&&t!=='PAGINAS').map(t=>({range:`${t}!A1:S1`,values:[HEAD]}))];
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:id,requestBody:{valueInputOption:'RAW',data}});
  ensured.add(id);
}

export async function getOrCreateSheet(_driveId:string,_name:string){
  const fixed=process.env.GOOGLE_SHEETS_ID?.trim();
  if(!fixed) throw new Error('Falta GOOGLE_SHEETS_ID: se requiere el Spreadsheet de salida ND');
  await ensure(fixed);
  return fixed;
}

export async function appendPages(id:string,driveId:string,name:string,pages:any[]){if(!pages.length)return;const rs=pages.map(p=>[driveId,name,p.page,p.text||'',JSON.stringify(p.bbox||[]),JSON.stringify(p.words||[]),JSON.stringify(p.blocks||[]),JSON.stringify(p.headings||[]),JSON.stringify(p.tables||[]),JSON.stringify(p.links||[]),JSON.stringify(p.images||[]),p.ocr_used?'SI':'NO']);for(let i=0;i<rs.length;i+=20)await sheets.spreadsheets.values.append({spreadsheetId:id,range:'PAGINAS!A1',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rs.slice(i,i+20)}});}

export async function appendFindings(id:string,driveId:string,name:string,findings:NDFinding[]){
  if(!findings.length)return;
  const normalized=findings.map(h=>({...h,kind:normalizeKind(h.kind)}));
  const all=rows(name,driveId,normalized);
  for(let i=0;i<all.length;i+=500)await sheets.spreadsheets.values.append({spreadsheetId:id,range:'HALLAZGOS_RAW!A1',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:all.slice(i,i+500)}});
  for(const[kind,tab]of Object.entries(KIND_TO_TAB)){const rr=rows(name,driveId,normalized.filter(x=>x.kind===kind));for(let i=0;i<rr.length;i+=500)await sheets.spreadsheets.values.append({spreadsheetId:id,range:`${tab}!A1`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rr.slice(i,i+500)}});}
  const unified=normalized.map(h=>unifiedRow(name,h));
  for(let i=0;i<unified.length;i+=250)await sheets.spreadsheets.values.append({spreadsheetId:id,range:'Hoja 1!A1',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:unified.slice(i,i+250)}});
}

export async function setDocumentStatus(id:string,driveId:string,name:string,status:string,total:number){await sheets.spreadsheets.values.update({spreadsheetId:id,range:'DOCUMENTO!A2:D2',valueInputOption:'RAW',requestBody:{values:[[driveId,name,status,total]]}});}
