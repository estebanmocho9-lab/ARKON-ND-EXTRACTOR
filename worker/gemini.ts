import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import type { NDFinding } from './types';

const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';
const SYSTEM=`Sos el extractor documental ND. No resumas ni inventes. Registrá hechos que el documento afirma. Identificá entidades concretas y asociá cada hecho como entidad -> aspecto -> dato documental. Conservá composición, usos, aplicaciones, ubicación, propiedades, magnitudes, valores, unidades, símbolos, condiciones, métodos, instrumentos, relaciones, normas, definiciones, fórmulas, tablas, figuras y evidencia. No generes categorías sin entidad concreta. Cada hallazgo debe ser trazable a página y fragmento.`;
const schema:any={type:'ARRAY',items:{type:'OBJECT',properties:{kind:{type:'STRING'},field:{type:'STRING'},entity:{type:'STRING'},aspect:{type:'STRING'},documentaryData:{type:'STRING'},originalText:{type:'STRING'},normalizedText:{type:'STRING'},value:{type:'NUMBER'},valueText:{type:'STRING'},unit:{type:'STRING'},symbol:{type:'STRING'},context:{type:'STRING'},page:{type:'INTEGER'},section:{type:'STRING'},confidence:{type:'NUMBER'},evidence:{type:'OBJECT',properties:{fragment:{type:'STRING'},page:{type:'INTEGER'},section:{type:'STRING'},start:{type:'INTEGER'},end:{type:'INTEGER'}},required:['fragment','page']},metadata:{type:'OBJECT'}},required:['kind','field','entity','aspect','documentaryData','originalText','normalizedText','context','page','confidence','evidence']}};

export async function extractPdf(pdfPath:string,name:string,documentId:string,fromPage:number,toPage:number):Promise<NDFinding[]>{
 const key=process.env.GEMINI_API_KEY;if(!key)throw new Error('Falta GEMINI_API_KEY');
 const manager=new GoogleAIFileManager(key);
 const uploaded=await manager.uploadFile(pdfPath,{mimeType:'application/pdf',displayName:name});
 const model=new GoogleGenerativeAI(key).getGenerativeModel({model:MODEL});
 const prompt=`${SYSTEM}\nDocumento: ${name}\nDrive ID: ${documentId}\nEXTRAÉ ÚNICAMENTE LAS PÁGINAS ${fromPage} A ${toPage}, INCLUSIVE. Ignorá el resto para este lote. Devolvé JSON puro según el esquema. La página es obligatoria y debe corresponder a la ubicación real. Incluí información de texto, tablas, figuras, diagramas y pies cuando sea legible. Priorizá cobertura exhaustiva.`;
 const result=await model.generateContent({contents:[{role:'user',parts:[{text:prompt},{fileData:{mimeType:uploaded.file.mimeType,fileUri:uploaded.file.uri}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:30000}} as any);
 const raw=result.response.text();let parsed:any;try{parsed=JSON.parse(raw)}catch{const m=raw.match(/\[[\s\S]*\]/);if(!m)throw new Error('Gemini no devolvió JSON válido');parsed=JSON.parse(m[0]);}
 return (Array.isArray(parsed)?parsed:[]).map((x:any)=>({...x,metadata:{...(x.metadata||{}),driveFileId:documentId,source:name,pageRange:`${fromPage}-${toPage}`}}));
}
