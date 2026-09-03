# ARKON-ND-EXTRACTOR

Extractor documental independiente de ARKON.

## Flujo

Google Drive (solo lectura) → GitHub Actions worker → Gemini → extracción ND exhaustiva → Google Sheets.

La web en Vercel es el panel: permite lanzar un documento. El procesamiento pesado ocurre en GitHub Actions, por lo que cerrar el navegador no interrumpe el trabajo.

## Automatización actual

- El workflow `ND Worker` corre automáticamente una vez por día y procesa **un PDF por corrida**.
- También puede lanzarse manualmente desde GitHub Actions o desde el panel web.
- Un PDF grande se procesa como un único documento.
- Varios PDFs pequeños pueden procesarse en corridas sucesivas sin paralelizar el mismo documento.
- El PDF temporal se elimina al terminar.
- Los PDFs originales nunca se modifican.
- La extracción no escribe en Supabase.
- NE no participa.

GitHub Free incluye 2.000 minutos mensuales para repositorios privados con runners estándar; por eso esta arquitectura evita Render Workers pagos y mantiene el extractor dentro del objetivo de costo cero mientras haya cuota disponible. citehttps://docs.github.com/es/billing/concepts/product-billing/github-actions

## Secretos necesarios

En `Settings → Secrets and variables → Actions` del repositorio:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `CARPETA_MADRE_DRIVE_ID`
- `ND_SHEETS_FOLDER_ID`
- `GEMINI_API_KEY`

**Importante:** `ND_SHEETS_FOLDER_ID` debe ser una carpeta de destino separada de la carpeta que contiene los PDFs. Compartí esa carpeta de destino con el service account como **Editor**. La carpeta de PDFs puede permanecer compartida como **Reader**.

Para que el panel web pueda lanzar workflows, en Vercel se configurarán:

- `GITHUB_ACTIONS_TOKEN`
- `ND_PANEL_SECRET`
- `GITHUB_OWNER=estebanmocho9-lab`
- `GITHUB_REPO=ARKON-ND-EXTRACTOR`

El token de GitHub debe tener permiso para disparar Actions en este repositorio privado.

## Estructura de salida

Cada PDF produce un Google Sheet `ARKON_ND_<nombre>` con pestañas documentales: `DOCUMENTO`, `HALLAZGOS_RAW`, `MATERIALES`, `COMPONENTES`, `PROPIEDADES`, `MAGNITUDES`, `ATRIBUTOS`, `RELACIONES`, `CONDICIONES`, `METODOS`, `INSTRUMENTOS`, `APLICACIONES`, `COMPORTAMIENTOS`, `NORMAS`, `DEFINICIONES`, `EVIDENCIAS`, `FORMULAS` y `ENTIDADES_DOCUMENTALES`.

Cada hallazgo conserva entidad concreta, aspecto, dato documental, texto original, página, sección, contexto y evidencia.

## Estado

La base web, el worker Drive→Gemini→Sheets y la automatización diaria ya están implementados. Falta únicamente cargar los secretos y desplegar el panel en Vercel.
