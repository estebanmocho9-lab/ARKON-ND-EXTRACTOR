import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import type { NDFinding } from './types';

const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';
const KINDS=['MATERIAL','COMPONENTE','PROPIEDAD','MAGNITUD','ATRIBUTO','RELACION','CONDICION','METODO','INSTRUMENTO','APLICACION','COMPORTAMIENTO','NORMA','DEFINICION','EVIDENCIA','FORMULA','ENTIDAD'];
const SYSTEM=`Sos el extractor documental ND. Tu objetivo es EXTRAER, no resumir.

REGLA PRINCIPAL: capturá absolutamente toda información documental concreta que aparezca en las páginas indicadas. Una oración puede contener varios hechos: separalos en hallazgos atómicos para no perder información. También extraé información concreta de tablas, listas, encabezados, notas, pies de figura, diagramas, fórmulas y leyendas cuando sea legible.

Cada hallazgo representa un dato que el documento realmente afirma y debe tener: entidad concreta -> aspecto concreto -> dato documental concreto. Nunca uses entidades genéricas como "material", "propiedad", "método" o "documento" cuando el texto identifica una entidad real.

CLASIFICACIÓN OBLIGATORIA: kind debe ser EXACTAMENTE uno de MATERIAL, COMPONENTE, PROPIEDAD, MAGNITUD, ATRIBUTO, RELACION, CONDICION, METODO, INSTRUMENTO, APLICACION, COMPORTAMIENTO, NORMA, DEFINICION, EVIDENCIA, FORMULA o ENTIDAD. No uses "fact", "property", "requirement" ni otros tipos.

No pierdas composición, componentes, usos, aplicaciones, ubicación, propiedades, magnitudes, valores, rangos, unidades, símbolos, condiciones ambientales o de ensayo, dependencias, comportamiento, métodos, instrumentos, relaciones causales o estructurales, normas, definiciones, fórmulas, procedimientos, requisitos y evidencia.

Si un dato cuantitativo describe una propiedad de una entidad, registrá la propiedad y la magnitud/valor como hallazgo separado cuando corresponda. Si una definición identifica qué es una entidad, registrala como DEFINICION. Si una afirmación vincula dos entidades, registrala como RELACION. Si el documento establece un requisito o condición de uso/ensayo, registralo como CONDICION o NORMA según corresponda.

Conservá el texto original y el fragmento de evidencia casi literalmente. No inventes, no completes con conocimiento externo y no deduzcas valores que el documento no expresa. La página es obligatoria y debe corresponder a la ubicación real del dato.`;
const schema:any={type:'ARRAY',items:{type:'OBJECT',properties:{kind:{type:'STRING',enum:KINDS},field:{type:'STRING'},entity:{type:'STRING'},aspect:{type:'STRING'},documentaryData:{type:'STRING'},originalText:{type:'STRING'},normalizedText:{type:'STRING'},value:{type:'NUMBER'},valueText:{type:'STRING'},unit:{type:'STRING'},symbol:{type:'STRING'},context:{type:'STRING'},page:{type:'INTEGER'},section:{type:'STRING'},confidence:{type:'NUMBER'},evidence:{type:'OBJECT',properties:{fragment:{type:'STRING'},page:{type:'INTEGER'},section:{type:'STRING'},start:{type:'INTEGER'},end:{type:'INTEGER'}},required:['fragment','page']},metadata:{type:'OBJECT'}},required:['kind','field','entity','aspect','documentaryData','originalText','normalizedText','context','page','confidence','evidence']}};

async function generateWithRetry(model:any, request:any){
  const delays=[5000,15000,30000,60000,120000];
  for(let attempt=0;attempt<=delays.length;attempt++){
    try{return await model.generateContent(request);}
    catch(err:any){
      const msg=String(err?.message||err);
      const temporary=/\[(?:503|429)|503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|temporarily|alta demanda|gran demanda/i.test(msg);
      if(!temporary||attempt===delays.length)throw err;
      const wait=delays[attempt];
      console.log(`ND | Gemini temporalmente no disponible | reintento ${attempt+1}/${delays.length} | espera ${wait/1000}s`);
      await new Promise(resolve=>setTimeout(resolve,wait));
    }
  }
  throw new Error('Gemini no disponible después de los reintentos');
}

export async function extractPdf(pdfPath:string,name:string,documentId:string,fromPage:number,toPage:number):Promise<NDFinding[]>{
 const key=process.env.GEMINI_API_KEY;if(!key)throw new Error('Falta GEMINI_API_KEY');
 const manager=new GoogleAIFileManager(key);
 const uploaded=await manager.uploadFile(pdfPath,{mimeType:'application/pdf',displayName:name});
 const model=new GoogleGenerativeAI(key).getGenerativeModel({model:MODEL});
 const prompt=`${SYSTEM}\n\nDocumento: ${name}\nDrive ID: ${documentId}\n\nLOTE ACTUAL: páginas ${fromPage} a ${toPage}, inclusive. IGNORÁ cualquier otra página para este lote.\n\nCOBERTURA EXHAUSTIVA: recorré cada página del lote y extraé todos los datos concretos que puedan servir para conocimiento técnico/documental. No limites artificialmente la cantidad de hallazgos. No devuelvas un resumen del lote. Si una página contiene 20 datos independientes, devolvé los 20. Si una tabla contiene 30 filas con datos, extraé las filas relevantes como hallazgos separados.\n\nPara cada hallazgo: usá una entidad real y específica, un aspecto específico y el dato documental exacto. La evidencia debe citar el fragmento que respalda el hallazgo y su página. Devolvé JSON puro según el esquema.`;
 const result=await generateWithRetry(model,{contents:[{role:'user',parts:[{text:prompt},{fileData:{mimeType:uploaded.file.mimeType,fileUri:uploaded.file.uri}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:30000}} as any);
 const raw=result.response.text();let parsed:any;try{parsed=JSON.parse(raw)}catch{const m=raw.match(/\[[\s\S]*\]/);if(!m)throw new Error('Gemini no devolvió JSON válido');parsed=JSON.parse(m[0]);}
 return (Array.isArray(parsed)?parsed:[]).map((x:any)=>({...x,kind:String(x.kind||'').toUpperCase(),metadata:{...(x.metadata||{}),driveFileId:documentId,source:name,pageRange:`${fromPage}-${toPage}`}}));
}
