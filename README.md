# ARKON-ND-EXTRACTOR

Extractor documental **independiente de ARKON**. Esta rama fusiona el enfoque documental ND de ARKON con el motor espacial determinístico y la salida a Google Sheets del extractor independiente.

## Regla de aislamiento

**ND solo escribe en Google Sheets.** No usa Turso ni Supabase. El worker además aborta si detecta variables de conexión de Turso o Supabase, para evitar que una configuración accidental desvíe datos.

ARKON no es modificado por este proyecto y las neuronas NE no participan.

## Flujo

Google Drive (solo lectura) → worker → PDF temporal → motor ND determinístico → Google Sheets.

## Motor ND fusionado

La extracción prioriza conservar evidencia antes de clasificarla:

1. **PyMuPDF**: texto completo, palabras, coordenadas, bloques, líneas, spans, tipografía, enlaces e imágenes.
2. **Mapa espacial**: asociación por línea/bloque, proximidad y bounding boxes; los hallazgos conservan coordenadas de la evidencia.
3. **Estructura documental**: detección de encabezados por tamaño, negrita, mayúsculas y numeración; seguimiento de sección por posición vertical.
4. **Tablas PyMuPDF**: extracción de tablas y celdas sin reemplazar el texto de página.
5. **Camelot**: segundo extractor independiente de tablas para aumentar cobertura.
6. **Reglas semánticas ND**: materiales, componentes, propiedades, métodos, instrumentos, aplicaciones, comportamiento, condiciones, definiciones y relaciones.
7. **Reglas documentales ampliadas**: composición, procesos, comparación, recomendación, limitaciones, deterioro y seguridad.
8. **Regex científicas**: valores, rangos, unidades, porcentajes, normas, fórmulas, símbolos y notación científica.
9. **Normalización numérica**: conserva el texto original y además interpreta decimales con coma/punto cuando es seguro.
10. **Contexto**: cada coincidencia conserva la línea y un fragmento documental alrededor del hallazgo.
11. **OCR local**: Tesseract solo cuando una página no tiene texto extraíble; el OCR también pasa por las reglas ND.
12. **Evidencia exhaustiva**: `PAGINAS` conserva texto completo + words + blocks + headings + tables + links + images + estado OCR.
13. **Clasificación sin destrucción**: si una regla no puede clasificar con precisión, la evidencia permanece en `HALLAZGOS_RAW`.
14. **Deduplicación trazable**: se elimina repetición exacta sin borrar hallazgos procedentes de reglas/fuentes diferentes.

## Automatización

- Procesamiento por bloques de páginas.
- Checkpoint/resume por PDF.
- Un mismo PDF no se procesa en paralelo.
- El PDF de Drive nunca se modifica.
- El PDF local se elimina al terminar.
- Sin IA para la extracción.
- Sin NE.
- Sin Turso.
- Sin Supabase.

## Salida

Cada PDF produce un Google Sheet `ARKON_ND_<nombre>` con:

`DOCUMENTO`, `PAGINAS`, `HALLAZGOS_RAW`, `MATERIALES`, `COMPONENTES`, `PROPIEDADES`, `MAGNITUDES`, `ATRIBUTOS`, `RELACIONES`, `CONDICIONES`, `METODOS`, `INSTRUMENTOS`, `APLICACIONES`, `COMPORTAMIENTOS`, `NORMAS`, `DEFINICIONES`, `EVIDENCIAS`, `FORMULAS` y `ENTIDADES_DOCUMENTALES`.

`PAGINAS` es la capa de auditoría. `HALLAZGOS_RAW` es la capa de conservación: la clasificación categorizada nunca debe ser la única copia del dato.

## Configuración

Obligatoria:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `CARPETA_MADRE_DRIVE_ID`
- `ND_SHEETS_FOLDER_ID`
- `ND_SHEETS_BOOTSTRAP_URL`
- `ND_SHEETS_BOOTSTRAP_TOKEN`

Opcionales de ejecución:

- `ND_PAGES_PER_CHUNK`
- `ND_MAX_PAGES_PER_RUN`
- `ND_MAX_MINUTES_PER_RUN`
- `ND_PYTHON_TIMEOUT_MS`
- `ND_DOCUMENTO_ID`

No se requiere `GEMINI_API_KEY`.

## Verificación

CI comprueba compilación TypeScript, sintaxis Python y el self-test del motor determinístico.

Antes de procesar un lote completo se debe ejecutar un PDF real y revisar `PAGINAS` + `HALLAZGOS_RAW` para medir cobertura y densidad de extracción.
