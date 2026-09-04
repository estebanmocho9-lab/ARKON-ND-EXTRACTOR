import { google } from 'googleapis';
import fs from 'node:fs';
import type { NDMemory } from './neural';

function auth(){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const p=process.env.GOOGLE_CREDENTIALS_PATH?.trim();
  const c=raw?JSON.parse(raw):p?JSON.parse(fs.readFileSync(p,'utf8')):null;
  if(!c)throw new Error('Falta credencial Google para mapa ND');
  return new google.auth.GoogleAuth({credentials:{client_email:c.client_email,private_key:c.private_key},scopes:['https://www.googleapis.com/auth/spreadsheets']});
}
const sheets=google.sheets({version:'v4',auth:auth()});
let ensured=false;

export async function ensureNeuralSheets(id:string){
  if(ensured)return;
  const m=await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets.properties'});
  const have=new Set((m.data.sheets||[]).map(s=>s.properties?.title));
  const names=['MAPA_ND','COORDENADAS_ND','MEMORIA_ND'];
  const requests=names.filter(n=>!have.has(n)).map(title=>({addSheet:{properties:{title}}}));
  if(requests.length)await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests}});
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:id,requestBody:{valueInputOption:'RAW',data:[
    {range:'MAPA_ND!A1:H1',values:[['documento_drive_id','documento','neurona','paginas','hallazgos','coordenadas','resumen_por_tipo','memoria_estado']]},
    {range:'COORDENADAS_ND!A1:I1',values:[['coordinate_id','documento_drive_id','neurona','pagina','seccion','tipo','entidad','knowledge_id','coordinate_path']]},
    {range:'MEMORIA_ND!A1:F1',values:[['documento_drive_id','documento','neurona','paginas','hallazgos','estado']]}
  ]}});
  ensured=true;
}

export async function appendNeuralMemory(id:string,m:NDMemory){
  await ensureNeuralSheets(id);
  const compact:any={};for(const c of m.coordinates)compact[c.kind]=(compact[c.kind]||0)+1;
  await sheets.spreadsheets.values.append({spreadsheetId:id,range:'MAPA_ND!A1',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[[m.documentId,m.documentName,m.neuron,[...m.pages].sort((a,b)=>a-b).join(','),m.findings,m.coordinates.length,JSON.stringify(compact),'cerrada']]}});
  const rows=m.coordinates.map(c=>[c.id,m.documentId,m.neuron,c.page,c.section,c.kind,c.entity,c.knowledgeId,c.path]);
  for(let i=0;i<rows.length;i+=500)if(rows.slice(i,i+500).length)await sheets.spreadsheets.values.append({spreadsheetId:id,range:'COORDENADAS_ND!A1',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rows.slice(i,i+500)}});
  await sheets.spreadsheets.values.append({spreadsheetId:id,range:'MEMORIA_ND!A1',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[[m.documentId,m.documentName,m.neuron,[...m.pages].sort((a,b)=>a-b).join(','),m.findings,'liberada']]}});
}
