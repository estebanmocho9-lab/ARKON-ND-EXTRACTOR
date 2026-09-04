import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pdf from 'pdf-parse';
import { listPdfs, downloadPdf } from './drive';
import { appendFindings, appendPages, getOrCreateSheet, setDocumentStatus } from './sheets';
import { getJob, saveJob } from './control';

const execFileAsync=promisify(execFile);
const PAGE_CHUNK=Number(process.env.ND_PAGES_PER_CHUNK||10);
const MAX_PAGES=Number(process.env.ND_MAX_PAGES_PER_RUN||80);
const MAX_MINUTES=Number(process.env.ND_MAX_MINUTES_PER_RUN||50);

async function deterministicExtract(file:string,fromPage:number,toPage:number){
 const {stdout}=await execFileAsync('python3',[path.join(process.cwd(),'worker','deterministic_extractor.py'),file,String(fromPage),String(toPage)],{maxBuffer:80*1024*1024,timeout:Math.max(120_000,Number(process.env.ND_PYTHON_TIMEOUT_MS||600_000)),env:{...process.env,PYTHONWARNINGS:'ignore'}});
 const lines=stdout.trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const jsonLine=[...lines].reverse().find(line=>line.startsWith('{')&&line.endsWith('}'));
 if(!jsonLine) throw new Error(`El extractor no devolvió JSON válido. Salida: ${stdout.slice(0,1000)}`);
 return JSON.parse(jsonLine);
}

async function processDoc(doc:any,budget:{pages:number,started:number}){
 const job=await getJob(doc.id,doc.name);
 if(job.status==='completado') return;
 const tmp=path.join(os.tmpdir(),`nd-${doc.id}.pdf`);
 console.log(`ND | ${doc.name} | desde página ${job.nextPage}`);
 fs.writeFileSync(tmp,await downloadPdf(doc.id));
 try{
  const meta=await pdf(fs.readFileSync(tmp));
  const total=meta.numpages||0;
  let sheetId=job.spreadsheetId||await getOrCreateSheet(doc.id,doc.name);
  await setDocumentStatus(sheetId,doc.id,doc.name,'procesando',0);
  let next=job.nextPage;
  while(next<=total && budget.pages<MAX_PAGES && (Date.now()-budget.started)<MAX_MINUTES*60_000){
   const to=Math.min(next+PAGE_CHUNK-1,total);
   console.log(`ND | mapa espacial | ${next}-${to}/${total}`);
   const result=await deterministicExtract(tmp,next,to);
   await appendPages(sheetId,doc.id,doc.name,result.pages||[]);
   await appendFindings(sheetId,doc.id,doc.name,result.findings||[]);
   const processed=to-next+1; budget.pages+=processed; next=to+1;
   await saveJob({driveId:doc.id,name:doc.name,spreadsheetId:sheetId,nextPage:next,totalPages:total,status:next>total?'completado':'procesando'});
   console.log(`ND | ${doc.name} | ${to}/${total} | paginas=${processed} | hallazgos=${(result.findings||[]).length}`);
  }
  const status=next>total?'completado':'pausado';
  await setDocumentStatus(sheetId,doc.id,doc.name,status,0);
  await saveJob({driveId:doc.id,name:doc.name,spreadsheetId:sheetId,nextPage:next,totalPages:total,status});
 } finally {try{fs.unlinkSync(tmp)}catch{}}
}

async function main(){
 const folder=process.env.CARPETA_MADRE_DRIVE_ID;if(!folder)throw new Error('Falta CARPETA_MADRE_DRIVE_ID');
 const requested=process.env.ND_DOCUMENTO_ID?.trim();const docs=await listPdfs(folder);
 const selected=requested?docs.filter(d=>d.id===requested||d.name.toLowerCase().includes(requested.toLowerCase())):docs;
 if(!selected.length)throw new Error(requested?`No se encontró el documento: ${requested}`:'No hay PDFs disponibles');
 const budget={pages:0,started:Date.now()};
 for(const doc of selected){if(budget.pages>=MAX_PAGES||(Date.now()-budget.started)>=MAX_MINUTES*60_000)break;await processDoc(doc,budget);}
 console.log(`ND FIN | paginas procesadas=${budget.pages} | minutos=${Math.round((Date.now()-budget.started)/6000)/10}`);
}
main().catch(e=>{console.error('ND ERROR:',e?.stack||e?.message||e);process.exit(1)});
