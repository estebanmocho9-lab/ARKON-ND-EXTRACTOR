export type TipoCandidatoND =
  | 'MATERIAL' | 'COMPONENTE' | 'ATRIBUTO' | 'PROPIEDAD' | 'MAGNITUD'
  | 'FORMULA' | 'RELACION' | 'METODO' | 'INSTRUMENTO' | 'NORMA'
  | 'CONDICION' | 'APLICACION' | 'COMPORTAMIENTO' | 'DEFINICION'
  | 'EVIDENCIA' | 'ENTIDAD_DOCUMENTAL' | 'DESCONOCIDO';

export interface EvidenciaND {
  documento: string;
  pagina: number;
  fragmento: string;
  idioma: 'es' | 'en' | 'mixto';
  posicionInicio?: number;
  posicionFin?: number;
  seccion?: string;
  tabla?: string;
  figura?: string;
}

export interface HallazgoND {
  id?: string;
  neuronId: string;
  tipo: TipoCandidatoND;
  campo?: string;
  textoOriginal: string;
  textoNormalizado: string;
  entidadCandidata?: string;
  entidadPrincipal?: string;
  aspecto?: string;
  datoDocumental?: string;
  relacionEntidad?: string;
  valor?: number;
  valorTexto?: string;
  unidad?: string;
  simbolo?: string;
  contexto: string;
  idioma: 'es' | 'en' | 'mixto';
  confianza: number;
  evidencia: EvidenciaND;
  metadatos?: Record<string, unknown>;
}
