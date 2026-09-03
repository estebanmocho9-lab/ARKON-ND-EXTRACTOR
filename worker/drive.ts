import { google } from 'googleapis';
import type { NDDocument } from './types';

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const c = JSON.parse(raw);
  return new google.auth.GoogleAuth({ credentials:{client_email:c.client_email,private_key:c.private_key}, scopes:['https://www.googleapis.com/auth/drive.readonly'] });
}
const drive = google.drive({version:'v3',auth:auth()});

export function folderId(value:string){ const v=value.trim(); const m=v.match(/folders\/([A-Za-z0-9_-]+)/); return m?.[1] || v; }
export async function listPdfs(parent:string):Promise<NDDocument[]> {
  const out:NDDocument[]=[]; let pageToken:string|undefined;
  do { const r=await drive.files.list({q:`'${folderId(parent)}' in parents and mimeType='application/pdf' and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,size)',pageSize:100,orderBy:'name',pageToken});
    for(const f of r.data.files||[]) if(f.id&&f.name) out.push({id:f.id,name:f.name,mimeType:f.mimeType||'application/pdf',sizeMB:f.size?Math.round(Number(f.size)/1048576*100)/100:0});
    pageToken=r.data.nextPageToken||undefined;
  } while(pageToken); return out;
}
export async function downloadPdf(id:string){ const r:any=await drive.files.get({fileId:id,alt:'media'},{responseType:'arraybuffer'}); return Buffer.from(r.data); }
