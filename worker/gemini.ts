import { GoogleGenerativeAI, GoogleAIFileManager } from '@google/generative-ai/server';
import type { NDFinding } from './types';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const SYSTEM = `Sos el extractor documental ND. Tu trabajo NO es resumir ni razonar: es registrar hechos que el documento afirma. Identificá entidades concretas (materiales, componentes, propiedades, magnitudes, instrumentos, métodos, normas, aplicaciones, comportamientos, condiciones, definiciones, fórmulas y otras entidades documentales) y asociá cada hecho como entidad -> aspecto -> dato documental. Conservá valores, unidades, símbolos, condiciones de medición, instrumento/método, relaciones, ubicación/aplicación, límites y evidencia. No inventes. No generes filas genéricas como 'material=material' o 'propiedad=propiedad'. Cada hallazgo debe poder trazarse a una página y fragmento textual/visual del PDF. Extraé también información de tablas, figuras, diagramas y pies cuando sea legible.`;

const schema = { type:'ARRAY', items:{ type:'OBJECT', properties:{
  kind:{type:'STRING',enum:['MATERIAL','COMPONENTE','PROPIEDAD','MAGNITUD','ATRIBUTO','RELACION','CONDICION','METODO','INSTRUMENTO','APLICACION','COMPORTAMIENTO','NORMA','DEFINICION','EVIDENCIA','FORMULA','ENTIDAD']},
  field:{type:'STRING'}, entity:{type:'STRING'}, aspect:{type:'STRING'}, documentaryData:{type:'STRING'}, originalText:{type:'STRING'}, normalizedText:{type:'STRING'}, value:{type:'NUMBER'}, valueText:{type:'STRING'}, unit:{type:'STRING'}, symbol:{type:'STRING'}, context:{type:'STRING'}, page:{type:'INTEGER'}, section:{type:'STRING'}, confidence:{type:'NUMBER'}, evidence:{type:'OBJECT',properties:{fragment:{type:'STRING'},page:{type:'INTEGER'},section:{type:'STRING'},start:{type:'INTEGER'},end:{type:'INTEGER'}},required:['fragment','page']}, metadata:{type:'OBJECT'}
},required:['kind','field','entity','aspect','documentaryData','originalText','normalizedText','context','page','confidence','evidence'] } } as any;

export async function extractPdf(pdf:Buffer,name:string,documentId:string):Promise<NDFinding[]> {
  const key=process.env.GEMINI_API_KEY; if(!key) throw new Error('Falta GEMINI_API_KEY');
  const files=new GoogleAIFileManager(key); const uploaded=await files.uploadFile(Buffer.from(pdf),{mimeType:'application/pdf',displayName:name});
  const ai=new GoogleGenerativeAI(key); const model=ai.getGenerativeModel({model:MODEL});
  const prompt=`${SYSTEM}\nDocumento: ${name}\nDrive ID: ${documentId}\nProcesá el PDF completo. Devolvé JSON puro siguiendo el esquema. Incluí página exacta en cada hallazgo. Priorizá cobertura documental exhaustiva por sobre síntesis.`;
  const result=await model.generateContent({contents:[{role:'user',parts:[{text:prompt},{fileData:{mimeType:uploaded.file.mimeType,fileUri:uploaded.file.uri}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:30000}} as any);
  const text=result.response.text(); let parsed:any; try{parsed=JSON.parse(text)}catch{ const m=text.match(/\[[\s\S]*\]/); if(!m)throw new Error('Gemini no devolvió JSON válido'); parsed=JSON.parse(m[0]); }
  return (Array.isArray(parsed)?parsed:[]).map((x:any)=>({...x,metadata:{...(x.metadata||{}),driveFileId:documentId,source:name}}));
}
