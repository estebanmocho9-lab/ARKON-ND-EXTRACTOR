import { NextResponse } from 'next/server';
export const runtime='nodejs';
export async function POST(req:Request){
 const secret=process.env.ND_PANEL_SECRET;if(!secret)return NextResponse.json({error:'ND_PANEL_SECRET no configurado'},{status:503});
 const auth=req.headers.get('authorization');if(auth!==`Bearer ${secret}`)return NextResponse.json({error:'No autorizado'},{status:401});
 const body=await req.json().catch(()=>({}));
 const token=process.env.GITHUB_ACTIONS_TOKEN;if(!token)return NextResponse.json({error:'GITHUB_ACTIONS_TOKEN no configurado'},{status:503});
 const owner=process.env.GITHUB_OWNER||'estebanmocho9-lab',repo=process.env.GITHUB_REPO||'ARKON-ND-EXTRACTOR';
 const r=await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/nd-worker.yml/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{documento_id:String(body.documento_id||'')}})});
 if(!r.ok)return NextResponse.json({error:`GitHub dispatch ${r.status}`},{status:502});
 return NextResponse.json({ok:true,status:'queued',documento_id:body.documento_id||null});
}
