import pdf from 'pdf-parse';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { listPdfs, downloadPdf } from './drive';
import { appendFindings, appendPages, createPdfSpreadsheet, setDocumentStatus, verifyUserSheetsAuth } from './sheets';
import { getJob, saveJob } from './control';
import { createMemory, processNeuralChunk } from './neural';
import { loadKnowledge } from './knowledge';
import { appendNeuralChunk, ensureNeuralSheets } from './neuralSheets';

const MAX_PAGES=Number(process.env.ND_MAX_PAGES_PER_RUN||80);
const MAX_MINUTES=Number(process.env.ND_MAX_MINUTES_PER_RUN||50);
const PY_TIMEOUT=Number(process.env.ND_PYTHON_TIMEOUT_MS||600_000);
function assertNDOnly(){if(process.env.ND_ALLOW_DB_WRITES==='true')throw new Error('ND bloqueada: ND_ALLOW_DB_WRITES=true está prohibido.');if(process.env.ND_WRITE_DESTINATION?.trim())throw new Error('ND bloqueada: ND_WRITE_DESTINATION no debe configurarse.');}
function deterministicExtract(buffer:Buffer,fromPage:number,toPage:number):Promise<any>{return new Promise((resolve,reject)=>{const child=spawn('python3',[path.join(process.cwd(),'worker','deterministic_stream.py'),String(fromPage),String(toPage)],{cwd:path.join(process.cwd(),'worker'),env:{...process.env,PYTHONWARNINGS:'ignore'},stdio:['pipe','pipe','pipe']});let stdout='';let stderr='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`Extractor Python excedió ${PY_TIMEOUT} ms`));},PY_TIMEOUT);child.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>100*1024*1024){clearTimeout(timer);child.kill('SIGKILL');reject(new Error('Salida del extractor demasiado grande'));}});child.stderr.on('data',d=>{stderr+=d.toString();});child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);if(code!==0){reject(new Error(`Extractor Python terminó con código ${code}. ${stderr.slice(0,2000)}`));return;}const lines=stdout.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const jsonLine=[...lines].reverse().find(x=>x.startsWith('{')&&x.endsWith('}'));if(!jsonLine){reject(new Error(`Extractor sin JSON. stderr=${stderr.slice(0,1000)}`));return;}try{resolve(JSON.parse(jsonLine))}catch(e){reject(new Error(`JSON inválido del extractor: ${e instanceof Error?e.message:e}`))}});child.stdin.on('error',()=>{});child.stdin.end(buffer);});}

async function processDoc(doc:any,numero:number,budget:{pages:number;started:number},knowledge:any[]){
  const job=await getJob(doc.id,doc.name,numero);
  if(job.status==='completado'){console.log(`ND | ${doc.name} | ya completado, se omite`);return false;}
  const neuron=`ND-${String(doc.sourceFolder||'00').padStart(2,'0')}`;
  let sheetId=job.spreadsheetId;
  if(!sheetId){
    const title=`ND-${String(numero).padStart(6,'0')}__${neuron}__${doc.name.replace(/\.pdf$/i,'')}`;
    const created=await createPdfSpreadsheet(title);
    await saveJob({...job,numero,spreadsheetId:created,status:'procesando'});
    sheetId=created;
  }else await ensureNeuralSheets(sheetId);
  if(!sheetId)throw new Error(`No se pudo resolver Spreadsheet para ${doc.name}`);
  const pdfSheetId=sheetId;
  console.log(`ND | ${neuron} | Nº ${String(numero).padStart(6,'0')} | ${doc.name} | Spreadsheet=${pdfSheetId} | desde página ${job.nextPage}`);
  const buffer=await downloadPdf(doc.id);
  try{
    const meta=await pdf(buffer);const total=meta.numpages||0;const memory=createMemory(doc.id,doc.name,neuron);
    await setDocumentStatus(pdfSheetId,doc.id,doc.name,'procesando',0);
    let next=job.nextPage;let findingsTotal=0;
    while(next<=total&&budget.pages<MAX_PAGES&&(Date.now()-budget.started)<MAX_MINUTES*60_000){
      console.log(`ND | ${neuron} | Nº ${String(numero).padStart(6,'0')} | página ${next}/${total} | extracción -> micro-neuronas -> Sheets -> checkpoint`);
      const result=await deterministicExtract(buffer,next,next);const pages=result.pages||[];const raw=result.findings||[];const neural=processNeuralChunk(raw,memory,knowledge,next,neuron);
      await appendPages(pdfSheetId,doc.id,doc.name,pages);
      await appendFindings(pdfSheetId,doc.id,doc.name,neural);
      await appendNeuralChunk(pdfSheetId,memory,neural);
      findingsTotal+=neural.length;budget.pages++;next++;
      await saveJob({numero,driveId:doc.id,name:doc.name,spreadsheetId:pdfSheetId,nextPage:next,totalPages:total,status:next>total?'completado':'procesando'});
      await setDocumentStatus(pdfSheetId,doc.id,doc.name,next>total?'completado':'procesando',findingsTotal);
      console.log(`ND | ${neuron} | Nº ${String(numero).padStart(6,'0')} | ${doc.name} | página ${next-1}/${total} CONFIRMADA | hallazgos=${neural.length} | total=${findingsTotal}`);
    }
    if(next>total){await setDocumentStatus(pdfSheetId,doc.id,doc.name,'completado',findingsTotal);await saveJob({numero,driveId:doc.id,name:doc.name,spreadsheetId:pdfSheetId,nextPage:next,totalPages:total,status:'completado'});console.log(`ND | ${neuron} | Nº ${String(numero).padStart(6,'0')} | ${doc.name} | PDF COMPLETADO | paginas=${total} | hallazgos=${findingsTotal} | Spreadsheet=${pdfSheetId}`);}
    else{await setDocumentStatus(pdfSheetId,doc.id,doc.name,'pausado',findingsTotal);await saveJob({numero,driveId:doc.id,name:doc.name,spreadsheetId:pdfSheetId,nextPage:next,totalPages:total,status:'procesando'});}
    return true;
  }finally{buffer.fill(0);}
}

async function main(){
  assertNDOnly();await verifyUserSheetsAuth();
  const folder=process.env.CARPETA_MADRE_DRIVE_ID;if(!folder)throw new Error('Falta CARPETA_MADRE_DRIVE_ID');
  const requested=process.env.ND_DOCUMENTO_ID?.trim();const requestedNeuron=process.env.ND_NEURONA?.trim().padStart(2,'0');if(!requested&&!requestedNeuron)throw new Error('Modo seguro: define ND_DOCUMENTO_ID o ND_NEURONA.');
  const allDocs=await listPdfs(folder);const numberById=new Map(allDocs.map((d,i)=>[d.id,i+1]));
  const docs=allDocs.filter(d=>!requestedNeuron||d.sourceFolder===requestedNeuron).filter(d=>!requested||(d.id===requested||d.name.toLowerCase().includes(requested.toLowerCase())));
  if(!docs.length)throw new Error(requested?`No se encontró el documento: ${requested}`:`No se encontraron PDFs en la neurona ${requestedNeuron}`);
  console.log(`ND | PDFs detectados en Drive=${allDocs.length} | PDFs seleccionados=${docs.length} | modo=1 Spreadsheet por PDF`);
  console.log('ND | cargando conocimiento externo en modo SOLO LECTURA...');const knowledge=await loadKnowledge();console.log(`ND | conocimiento de referencia cargado: ${knowledge.length} registros (sin persistencia de extracción)`);
  const budget={pages:0,started:Date.now()};let processedDocs=0;
  for(const doc of docs){if(budget.pages>=MAX_PAGES||(Date.now()-budget.started)>=MAX_MINUTES*60_000)break;const numero=numberById.get(doc.id)||1;const did=await processDoc(doc,numero,budget,knowledge);if(did){processedDocs++;break;}}
  console.log(`ND FIN | PDFs procesados en esta ejecución=${processedDocs} | paginas=${budget.pages} | DB=solo lectura | 1 Spreadsheet/PDF`);
}
main().catch(e=>{console.error('ND ERROR:',e?.stack||e?.message||e);process.exit(1)});
