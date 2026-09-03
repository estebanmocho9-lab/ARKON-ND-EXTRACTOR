import { google } from 'googleapis';

const TAB='JOBS';
const HEAD=['drive_id','documento','spreadsheet_id','next_page','total_pages','status','updated_at'];

function getAuth(){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const c=JSON.parse(raw);
  return new google.auth.GoogleAuth({credentials:{client_email:c.client_email,private_key:c.private_key},scopes:['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets']});
}
const auth=getAuth();
const sheets=google.sheets({version:'v4',auth});
const drive=google.drive({version:'v3',auth});

async function controlSheetId(){
  const parent=process.env.ND_SHEETS_FOLDER_ID;
  if(!parent) throw new Error('Falta ND_SHEETS_FOLDER_ID');
  const q=`'${parent}' in parents and name='ARKON_ND_CONTROL' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const found=await drive.files.list({q,fields:'files(id)',pageSize:1});
  if(found.data.files?.[0]?.id) return found.data.files[0].id;
  const created=await drive.files.create({requestBody:{name:'ARKON_ND_CONTROL',mimeType:'application/vnd.google-apps.spreadsheet',parents:[parent]},fields:'id'});
  const id=created.data.id!;
  await sheets.spreadsheets.values.update({spreadsheetId:id,range:`${TAB}!A1:G1`,valueInputOption:'RAW',requestBody:{values:[HEAD]}});
  return id;
}

export interface NDJob { driveId:string; name:string; spreadsheetId?:string; nextPage:number; totalPages:number; status:string; }

export async function getJob(driveId:string,name:string):Promise<NDJob>{
  const id=await controlSheetId();
  const r=await sheets.spreadsheets.values.get({spreadsheetId:id,range:`${TAB}!A2:G`});
  const rows=r.data.values||[];
  const row=rows.find(x=>x[0]===driveId);
  if(!row) return {driveId,name,nextPage:1,totalPages:0,status:'pendiente'};
  return {driveId,name:row[1]||name,spreadsheetId:row[2]||undefined,nextPage:Number(row[3]||1),totalPages:Number(row[4]||0),status:row[5]||'pendiente'};
}

export async function saveJob(job:NDJob){
  const id=await controlSheetId();
  const r=await sheets.spreadsheets.values.get({spreadsheetId:id,range:`${TAB}!A2:G`});
  const rows=r.data.values||[];
  const index=rows.findIndex(x=>x[0]===job.driveId);
  const values=[[job.driveId,job.name,job.spreadsheetId||'',job.nextPage,job.totalPages,job.status,new Date().toISOString()]];
  if(index<0){ await sheets.spreadsheets.values.append({spreadsheetId:id,range:`${TAB}!A:G`,valueInputOption:'RAW',requestBody:{values}}); }
  else { await sheets.spreadsheets.values.update({spreadsheetId:id,range:`${TAB}!A${index+2}:G${index+2}`,valueInputOption:'RAW',requestBody:{values}}); }
}
