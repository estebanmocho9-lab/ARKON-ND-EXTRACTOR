import pdf from 'pdf-parse';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { listPdfs, downloadPdf } from './drive';
import { appendFindings, appendPages, getOrCreateSheet, setDocumentStatus } from './sheets';
import { getJob, saveJob } from './control';
import { createMemory, processNeuralChunk, compressMemory } from './neural';
import { loadKnowledge } from './knowledge';
import { appendNeuralMemory, appendNeuralChunk, ensureNeuralSheets } from './neuralSheets';

const PAGE_CHUNK=1;
const MAX_PAGES=Number(process.env.ND_MAX_PAGES_PER_RUN||80);
const MAX_MINUTES=Number(process.env.ND_MAX_MINUTES_PER_RUN||50);
const PY_TIMEOUT=Number(process.env.ND_PYTHON_TIMEOUT_MS||600_000);

function assertNDOnly(){if(process.env.ND_ALLOW_DB_WRITES==='true')throw new Error('ND bloqueada: ND_ALLOW_DB_WRITES=true está prohibido.');if(process.env.ND_WRITE_DESTINATION?.trim())throw new Error('ND bloqueada: ND_WRITE_DESTINATION no debe configurarse.');}
function deterministicExtract(buffer:Buffer,fromPage:number,toPage:number):Promise<any>{return new Promise((resolve,reject)=>{const child=spawn('python3',[path.join(process.cwd(),'worker','deterministic_stream.py'),String(fromPage),String(toPage)],{cwd:path.join(process.cwd(),'worker'),env:{...process.env,PYTHONWARNINGS:'ignore'},stdio:['pipe','pipe','pipe']});let stdout='';let stderr='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`Extractor Python excedió ${PY_TIMEOUT} ms`));},PY_TIMEOUT);child.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>100*1024*1024){clearTimeout(timer);child.kill('SIGKILL');reject(new Error('Salida del extractor demasiado grande'));}});child.stderr.on('data',d=>{stderr+=d.toString();});child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);if(code!==0){reject(new Error(`Extractor Python terminó con código ${code}. ${stderr.slice(0,2000)}`));return;}const lines=stdout.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const jsonLine=[...lines].reverse().find(x=>x.startsWith('{')&&x.endsWith('}'));if(!jsonLine){reject(new Error(`Extractor sin JSON. stderr=${stderr.slice(0,1000)}`));return;}try{resolve(JSON.parse(jsonLine))}catch(e){reject(new Error(`JSON inválido del extractor: ${e instanceof Error?e.message:e}`))}});child.stdin.on('error',()=>{});child.stdin.end(buffer);});}

async function processDoc(doc:any,budget:{pages:number;started:number},sheetId:string,knowledge:any[]){const job=await getJob(doc.id,doc.name);if(job.status==='completado')return;const neuron=`ND-${String(doc.sourceFolder||'00').padStart(2,'0')}`;console.log(`ND | ${neuron} | ${doc.name} | desde página ${job.nextPage}`);const buffer=await downloadPdf(doc.id);try{const meta=await pdf(buffer);const total=meta.numpages||0;const memory=createMemory(doc.id,doc.name,neuron);await setDocumentStatus(sheetId,doc.id,doc.name,'procesando',0);let next=job.nextPage;let findingsTotal=0;while(next<=total&&budget.pages<MAX_PAGES&&(Date.now()-budget.started)<MAX_MINUTES*60_000){console.log(`ND | ${neuron} | extracción + micro-neuronas RAM | página ${next}/${total}`);const result=await deterministicExtract(buffer,next,next);const pages=result.pages||[];const raw=result.findings||[];const neural=processNeuralChunk(raw,memory,knowledge,next,neuron);
    // Persistencia incremental: cada página y sus hallazgos se escriben antes de pasar a la siguiente.
    await appendPages(sheetId,doc.id,doc.name,pages);
    await appendFindings(sheetId,doc.id,doc.name,neural);
    await appendNeuralChunk(sheetId,memory,neural);
    findingsTotal+=neural.length;budget.pages++;next++;
    await saveJob({driveId:doc.id,name:doc.name,spreadsheetId:sheetId,nextPage:next,totalPages:total,status:next>total?'completado':'procesando'});
    await setDocumentStatus(sheetId,doc.id,doc.name,next>total?'completado':'procesando',findingsTotal);
    console.log(`ND | ${neuron} | ${doc.name} | ${next-1}/${total} guardada | hallazgos=${neural.length} | total=${findingsTotal}`);
  }
  if(next>total){const compressed=compressMemory(memory);await appendNeuralMemory(sheetId,memory);await setDocumentStatus(sheetId,doc.id,doc.name,'completado',findingsTotal);await saveJob({driveId:doc.id,name:doc.name,spreadsheetId:sheetId,nextPage:next,totalPages:total,status:'completado'});console.log(`ND | ${neuron} | MEMORIA RAM finalizada | paginas=${compressed.pages.length} | hallazgos=${compressed.findings} | coordenadas=${compressed.coordinates.length}`);}else{await setDocumentStatus(sheetId,doc.id,doc.name,'pausado',findingsTotal);await saveJob({driveId:doc.id,name:doc.name,spreadsheetId:sheetId,nextPage:next,totalPages:total,status:'procesando'});}}
  finally{buffer.fill(0);}}

async function main(){assertNDOnly();const folder=process.env.CARPETA_MADRE_DRIVE_ID;if(!folder)throw new Error('Falta CARPETA_MADRE_DRIVE_ID');const requested=process.env.ND_DOCUMENTO_ID?.trim();const requestedNeuron=process.env.ND_NEURONA?.trim().padStart(2,'0');const docs=(await listPdfs(folder)).filter(d=>!requestedNeuron||d.sourceFolder===requestedNeuron).filter(d=>!requested||(d.id===requested||d.name.toLowerCase().includes(requested.toLowerCase())));if(!docs.length)throw new Error(requested?`No se encontró el documento: ${requested}`:requestedNeuron?`No se encontraron PDFs en la neurona ${requestedNeuron}`:'No hay PDFs disponibles');const sheetId=await getOrCreateSheet('', 'ND');await ensureNeuralSheets(sheetId);console.log('ND | cargando conocimiento externo en modo SOLO LECTURA...');const knowledge=await loadKnowledge();console.log(`ND | conocimiento de referencia cargado: ${knowledge.length} registros (sin persistencia de extracción)`);const budget={pages:0,started:Date.now()};for(const doc of docs){if(budget.pages>=MAX_PAGES||(Date.now()-budget.started)>=MAX_MINUTES*60_000)break;await processDoc(doc,budget,sheetId,knowledge);}console.log(`ND FIN | paginas procesadas=${budget.pages} | minutos=${Math.round((Date.now()-budget.started)/6000)/10} | destino=Google Sheets | DB=solo lectura`);}
main().catch(e=>{console.error('ND ERROR:',e?.stack||e?.message||e);process.exit(1)});
