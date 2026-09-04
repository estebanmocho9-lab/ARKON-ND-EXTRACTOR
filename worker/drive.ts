import { google } from 'googleapis';
import fs from 'node:fs';
import type { NDDocument } from './types';

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const c = JSON.parse(raw);
    return new google.auth.GoogleAuth({ credentials:{client_email:c.client_email,private_key:c.private_key}, scopes:['https://www.googleapis.com/auth/drive.readonly'] });
  }
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH?.trim();
  if (!credentialsPath) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_CREDENTIALS_PATH');
  if (!fs.existsSync(credentialsPath)) throw new Error(`No existe GOOGLE_CREDENTIALS_PATH: ${credentialsPath}`);
  const c = JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
  return new google.auth.GoogleAuth({ credentials:{client_email:c.client_email,private_key:c.private_key}, scopes:['https://www.googleapis.com/auth/drive.readonly'] });
}
const drive = google.drive({version:'v3',auth:auth()});
export function folderId(value:string){ const v=value.trim(); const m=v.match(/folders\/([A-Za-z0-9_-]+)/); return m?.[1] || v; }
async function listChildren(parentId:string){
  const out:any[]=[]; let pageToken:string|undefined;
  do {
    const r=await drive.files.list({q:`'${folderId(parentId)}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,size)',pageSize:100,orderBy:'name',pageToken});
    out.push(...(r.data.files||[])); pageToken=r.data.nextPageToken||undefined;
  } while(pageToken);
  return out;
}
export async function listPdfs(parent:string):Promise<NDDocument[]> {
  const out:NDDocument[]=[]; const queue:Array<{id:string;neuron?:string}>=[{id:folderId(parent)}]; const seen=new Set<string>();
  while(queue.length){
    const current=queue.shift()!; if(seen.has(current.id)) continue; seen.add(current.id);
    const children=await listChildren(current.id);
    for(const f of children){
      if(!f.id||!f.name) continue;
      if(f.mimeType==='application/vnd.google-apps.folder'){
        const neuron=/^(0[1-9]|10)$/.test(f.name.trim())?f.name.trim():current.neuron;
        queue.push({id:f.id,neuron});
      } else if(f.mimeType==='application/pdf') out.push({id:f.id,name:f.name,mimeType:'application/pdf',sizeMB:f.size?Math.round(Number(f.size)/1048576*100)/100:0,sourceFolder:current.neuron});
    }
  }
  return out.sort((a,b)=>(a.sourceFolder||'99').localeCompare(b.sourceFolder||'99')||a.name.localeCompare(b.name));
}
export async function downloadPdf(id:string){ const r:any=await drive.files.get({fileId:id,alt:'media'},{responseType:'arraybuffer'}); return Buffer.from(r.data); }
