import { google } from 'googleapis';
import type { NDFinding } from './types';

const TABS=['DOCUMENTO','PAGINAS','HALLAZGOS_RAW','MATERIALES','COMPONENTES','PROPIEDADES','MAGNITUDES','ATRIBUTOS','RELACIONES','CONDICIONES','METODOS','INSTRUMENTOS','APLICACIONES','COMPORTAMIENTOS','NORMAS','DEFINICIONES','EVIDENCIAS','FORMULAS','ENTIDADES_DOCUMENTALES'];
const HEAD=['drive_id','documento','tipo','campo','entidad','aspecto','dato_documental','texto_original','texto_normalizado','valor','valor_texto','unidad','simbolo','contexto','pagina','seccion','confianza','evidencia_json','metadatos_json'];
const PAGE_HEAD=['drive_id','documento','pagina','texto_completo','bbox_json','words_json','blocks_json','headings_json','tables_json','links_json','images_json','ocr_usado'];
const KIND_TO_TAB:any={MATERIAL:'MATERIALES',COMPONENTE:'COMPONENTES',PROPIEDAD:'PROPIEDADES',MAGNITUD:'MAGNITUDES',ATRIBUTO:'ATRIBUTOS',RELACION:'RELACIONES',CONDICION:'CONDICIONES',METODO:'METODOS',INSTRUMENTO:'INSTRUMENTOS',APLICACION:'APLICACIONES',COMPORTAMIENTO:'COMPORTAMIENTOS',NORMA:'NORMAS',DEFINICION:'DEFINICIONES',EVIDENCIA:'EVIDENCIAS',FORMULA:'FORMULAS',ENTIDAD:'ENTIDADES_DOCUMENTALES'};
function getAuth(){const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;if(!raw)throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');const c=JSON.parse(raw);return new google.auth.GoogleAuth({credentials:{client_email:c.client_email,private_key:c.private_key},scopes:['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets']});}
const auth=getAuth();const sheets=google.sheets({version:'v4',auth});const drive=google.drive({version:'v3',auth});
const ensured=new Set<string>();
function rows(doc:string,id:string,findings:NDFinding[]){return findings.map(h=>[id,doc,h.kind,h.field,h.entity,h.aspect,h.documentaryData,h.originalText,h.normalizedText,h.value??'',h.valueText??'',h.unit??'',h.symbol??'',h.context,h.page,h.section??'',h.confidence,JSON.stringify(h.evidence),JSON.stringify(h.metadata||{})]);}
async function ensure(id:string){
 if(ensured.has(id)) return;
 const m=await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets.properties'});
 const have=new Set((m.data.sheets||[]).map(s=>s.properties?.title));
 const requests=TABS.filter(t=>!have.has(t)).map(t=>({addSheet:{properties:{title:t}}}));
 if(requests.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests}});
 const data=[{range:'DOCUMENTO!A1',values:[['drive_id','documento','estado','hallazgos_total']]},{range:'PAGINAS!A1',values:[PAGE_HEAD]},...TABS.filter(t=>t!=='DOCUMENTO'&&t!=='PAGINAS').map(t=>({range:`${t}!A1`,values:[HEAD]}))];
 await sheets.spreadsheets.values.batchUpdate({spreadsheetId:id,requestBody:{valueInputOption:'RAW',data}});
 ensured.add(id);
}
async function bootstrapAsUser(name:string){
 const url=process.env.ND_SHEETS_BOOTSTRAP_URL?.trim(); const token=process.env.ND_SHEETS_BOOTSTRAP_TOKEN?.trim();
 if(!url||!token) throw new Error('Falta ND_SHEETS_BOOTSTRAP_URL o ND_SHEETS_BOOTSTRAP_TOKEN');
 const c=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,name,service_account:c.client_email})});
 const text=await response.text(); if(!response.ok) throw new Error(`Sheets bootstrap HTTP ${response.status}: ${text.slice(0,500)}`);
 let data:any; try{data=JSON.parse(text)}catch{throw new Error(`Sheets bootstrap devolvió una respuesta no JSON: ${text.slice(0,300)}`)}
 if(!data.ok||!data.spreadsheetId) throw new Error(`Sheets bootstrap falló: ${data.error||'sin spreadsheetId'}`);
 console.log(`ND | Sheets bootstrap OK | ${data.name||name}`); return data.spreadsheetId as string;
}
export async function getOrCreateSheet(driveId:string,name:string){
 const parent=process.env.ND_SHEETS_FOLDER_ID;if(!parent)throw new Error('Falta ND_SHEETS_FOLDER_ID');
 const safe=`ARKON_ND_${name.replace(/[^\w.-]+/g,'_').slice(0,70)}`;
 const q=`'${parent}' in parents and name='${safe.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
 const found=await drive.files.list({q,fields:'files(id,name)',pageSize:1}); let id=found.data.files?.[0]?.id; if(!id) id=await bootstrapAsUser(name); await ensure(id); return id;
}
function normalizeKind(kind:string):string{const k=String(kind||'').trim().toUpperCase();if(KIND_TO_TAB[k])return k;if(k==='PROPERTY')return'PROPIEDAD';if(k==='MAGNITUDE')return'MAGNITUD';if(k==='DEFINITION')return'DEFINICION';if(k==='COMPONENT')return'COMPONENTE';if(k==='RELATION')return'RELACION';if(k==='CONDITION'||k==='REQUIREMENT')return'CONDICION';if(k==='METHOD')return'METODO';if(k==='INSTRUMENT')return'INSTRUMENTO';if(k==='APPLICATION')return'APLICACION';if(k==='BEHAVIOR')return'COMPORTAMIENTO';if(k==='STANDARD'||k==='NORM')return'NORMA';if(k==='FORMULA')return'FORMULA';if(k==='EVIDENCE')return'EVIDENCIA';if(k==='ATTRIBUTE')return'ATRIBUTO';if(k==='ENTITY')return'ENTIDAD';return'';}
export async function appendPages(id:string,driveId:string,name:string,pages:any[]){
 if(!pages.length)return;
 const rs=pages.map(p=>[driveId,name,p.page,p.text||'',JSON.stringify(p.bbox||[]),JSON.stringify(p.words||[]),JSON.stringify(p.blocks||[]),JSON.stringify(p.headings||[]),JSON.stringify(p.tables||[]),JSON.stringify(p.links||[]),JSON.stringify(p.images||[]),p.ocr_used?'SI':'NO']);
 for(let i=0;i<rs.length;i+=20) await sheets.spreadsheets.values.append({spreadsheetId:id,range:'PAGINAS',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rs.slice(i,i+20)}});
}
export async function appendFindings(id:string,driveId:string,name:string,findings:NDFinding[]){if(!findings.length)return;const normalized=findings.map(h=>({...h,kind:normalizeKind(h.kind)}));const all=rows(name,driveId,normalized);for(let i=0;i<all.length;i+=500)await sheets.spreadsheets.values.append({spreadsheetId:id,range:'HALLAZGOS_RAW',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:all.slice(i,i+500)}});for(const[kind,tab]of Object.entries(KIND_TO_TAB)){const rr=rows(name,driveId,normalized.filter(x=>x.kind===kind));for(let i=0;i<rr.length;i+=500)await sheets.spreadsheets.values.append({spreadsheetId:id,range:tab,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rr.slice(i,i+500)}});}}
export async function setDocumentStatus(id:string,driveId:string,name:string,status:string,total:number){await sheets.spreadsheets.values.update({spreadsheetId:id,range:'DOCUMENTO!A2:D2',valueInputOption:'RAW',requestBody:{values:[[driveId,name,status,total]]}});}
