import 'dotenv/config';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { listPdfs, downloadPdf } from './drive';
import { extractPdf } from './gemini';
import { createSheet } from './sheets';

async function main(){
 const folder=process.env.CARPETA_MADRE_DRIVE_ID;if(!folder)throw new Error('Falta CARPETA_MADRE_DRIVE_ID');
 const requested=process.env.ND_DOCUMENTO_ID?.trim();const docs=await listPdfs(folder);
 const doc=requested?docs.find(d=>d.id===requested||d.name.toLowerCase().includes(requested.toLowerCase())):docs[0];
 if(!doc)throw new Error(requested?`No se encontró el documento: ${requested}`:'No hay PDFs disponibles');
 console.log(`ND | ${doc.name} | ${doc.sizeMB} MB`);
 const tmp=path.join(os.tmpdir(),`nd-${doc.id}.pdf`);fs.writeFileSync(tmp,await downloadPdf(doc.id));
 try{const findings=await extractPdf(tmp,doc.name,doc.id);console.log(`Gemini: ${findings.length} hallazgos`);const sheet=await createSheet(findings,doc.id,doc.name);console.log(`Sheets: ${sheet}`);}
 finally{try{fs.unlinkSync(tmp)}catch{}}
}
main().catch(e=>{console.error('ND ERROR:',e?.message||e);process.exit(1)});
