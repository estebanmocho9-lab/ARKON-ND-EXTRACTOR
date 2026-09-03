# ARKON-ND-EXTRACTOR

Extractor documental independiente de ARKON.

## Flujo objetivo

Google Drive → worker ND → Gemini → extracción exhaustiva → Google Sheets.

La aplicación web sirve como panel de control: seleccionar documentos, iniciar/reanudar lotes y consultar progreso. El procesamiento pesado no depende de mantener abierta la página.

## Reglas

- ND es documental; no ejecuta NE.
- No escribe en Supabase durante extracción.
- Los PDFs originales de Drive no se modifican.
- Se preserva evidencia: documento, Drive ID, página, sección y fragmento.
- Se usa checkpoint/resume para documentos grandes.
- Un PDF grande se procesa como un único documento; varios PDFs pequeños pueden entrar en el mismo lote.
- La salida se organiza en Google Sheets por documento, con posibilidad de particionar documentos demasiado grandes.

## Estado

Base web inicial creada. Siguiente fase: portar el extractor ND exhaustivo, conectar Drive/Gemini/Sheets y agregar el motor de jobs/checkpoints.
