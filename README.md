# ARKON-ND-EXTRACTOR

Extractor documental independiente de ARKON.

## Flujo

Google Drive (solo lectura) → GitHub Actions worker → **motor espacial determinístico local** → Google Sheets.

No depende de Gemini, OpenAI ni ninguna API de IA para extraer. La web en Vercel es opcional y funciona como panel; el procesamiento pesado ocurre en GitHub Actions.

## Motor ND

La extracción combina varias capas sin IA:

1. **PyMuPDF**: texto completo, palabras con coordenadas, bloques, líneas, spans, tipografía, enlaces, imágenes y estructura.
2. **Mapa espacial**: relaciones por proximidad, misma línea/bloque, posición arriba/abajo/izquierda/derecha y contexto.
3. **Tablas PyMuPDF**: detección y extracción de tablas/celdas.
4. **Camelot**: segunda extracción independiente de tablas para aumentar cobertura.
5. **Regex y reglas**: valores, rangos, unidades, porcentajes, normas, fórmulas, símbolos y patrones documentales.
6. **Tipografía/layout**: encabezados y secciones.
7. **OCR local**: Tesseract solo para páginas que no tienen texto extraíble.
8. **Evidencia completa**: la pestaña `PAGINAS` conserva el texto completo y el mapa de cada página para que una clasificación imperfecta nunca destruya información.

La prioridad es **extraer primero y clasificar después**. Si una regla no sabe clasificar un dato, el dato sigue guardado en bruto.

## Automatización

- Workflow `ND Worker` automático y manual.
- Procesa PDFs grandes por bloques de páginas con checkpoint/resume.
- Varios PDFs pueden continuar en ejecuciones sucesivas; no se paraleliza el mismo PDF.
- El PDF fuente de Drive nunca se modifica.
- El PDF local es temporal y se elimina al terminar.
- No escribe extracción en Supabase.
- NE no participa.

## Secretos

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `CARPETA_MADRE_DRIVE_ID`
- `ND_SHEETS_FOLDER_ID`
- `ND_SHEETS_BOOTSTRAP_URL`
- `ND_SHEETS_BOOTSTRAP_TOKEN`

No se necesita `GEMINI_API_KEY`.

## Salida

Cada PDF produce un Google Sheet `ARKON_ND_<nombre>` con `DOCUMENTO`, `PAGINAS`, `HALLAZGOS_RAW` y las pestañas ND categorizadas.

`PAGINAS` es la capa de auditoría exhaustiva: texto completo + coordenadas + bloques + encabezados + tablas + enlaces + imágenes + estado OCR.

## Estado

El extractor ND está migrado al motor determinístico espacial. El siguiente paso operativo es ejecutar una prueba con un PDF real y revisar densidad/cobertura antes de lanzar el lote completo.
