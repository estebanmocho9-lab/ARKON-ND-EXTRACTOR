import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import pdf from 'pdf-parse';
import { listPdfs, downloadPdf } from './drive';
import { extractPdf } from './gemini';
import { appendFindings, getOrCreateSheet, setDocumentStatus } from './sheets';
import { getJob, saveJob } from './control';

const PAGE_CHUNK=Number(process.env.ND_PAGES_PER_CHUNK||10);
const MAX_PAGES=Number(process.env.ND_MAX_PAGES_PER_RUN||80);
const MAX_MINUTES=Number(process.env.ND_MAX_MINUTES_PER_RUN||50);

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
   const findings=await extractPdf(tmp,doc.name,doc.id,next,to);
   await appendFindings(sheetId,doc.id,doc.name,findings);
   budget.pages+=to-next+1;
   next=to+1;
   await saveJob({driveId:doc.id,name:doc.name,spreadsheetId:sheetId,nextPage:next,totalPages:total,status:next>total?'completado':'procesando'});
   console.log(`ND | ${doc.name} | ${to}/${total} | ${findings.length} hallazgos`);
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
 console.log(`ND FIN | páginas procesadas=${budget.pages} | minutos=${Math.round((Date.now()-budget.started)/6000)/10}`);
}
main().catch(e=>{console.error('ND ERROR:',e?.message||e);process.exit(1)});
