export const ND_NEURONS=Object.freeze(Array.from({length:10},(_,i)=>`ND-${String(i+1).padStart(2,'0')}`));
export const ND_MICRO_NEURONS=Object.freeze(['micro-estructura','micro-entidad','micro-numerica','micro-normativa','micro-contexto','micro-relaciones','micro-semantica','micro-evidencia']);
export function neuronFromFolder(folder?:string){const n=Number(folder);if(!Number.isInteger(n)||n<1||n>10)return undefined;return`ND-${String(n).padStart(2,'0')}`;}
