# ND Spatial Engine

ND ya no depende de Gemini ni de ninguna API de IA para extraer documentos.

## Pipeline

`Google Drive -> PDF local temporal -> PyMuPDF -> mapa espacial -> tablas PyMuPDF/Camelot -> reglas/regex -> OCR local si hace falta -> Sheets`

## Mapa documental

Cada página conserva:

- texto completo;
- palabras con `x0,y0,x1,y1`, bloque, línea y posición;
- bloques con bbox y spans;
- encabezados detectados por geometría/tipografía;
- tablas, filas y celdas;
- enlaces e imágenes;
- indicador de OCR.

La pestaña `PAGINAS` es la capa de auditoría exhaustiva. Las categorías de `HALLAZGOS_RAW` y las pestañas ND son una segunda representación; no sustituyen al texto completo.

## Extracción determinística

Se detectan de forma reproducible:

- valores, rangos, porcentajes y unidades;
- normas ASTM/ISO/EN/DIN/UNE/AASHTO/ACI/ASME/IEEE/IEC/NF/BS/CSA/CEN;
- fórmulas y símbolos frecuentes;
- encabezados y secciones;
- materiales, componentes, propiedades, métodos, instrumentos, aplicaciones, comportamiento, condiciones, definiciones y relaciones mediante patrones documentales;
- celdas de tablas mediante dos motores independientes.

Cuando una regla no puede determinar una entidad con seguridad, el contenido sigue conservado en `PAGINAS` y/o `HALLAZGOS_RAW`; no se elimina por no saber clasificarlo.

## Tablas

PyMuPDF `Page.find_tables()` es el primer motor. Camelot se usa como segunda lectura para documentos con texto. Las salidas se conservan como evidencia y no se usan para borrar información de la primera pasada.

## OCR

Las páginas sin texto extraíble intentan OCR local con Tesseract. No se envían páginas a ningún servicio externo.

## Checkpoint

El worker mantiene el checkpoint por `drive_id`, `next_page`, `total_pages`, estado y spreadsheet. Los documentos grandes se procesan en bloques de páginas; varios documentos pueden continuar en ejecuciones sucesivas. No se modifica el PDF fuente.
