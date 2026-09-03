# Bootstrap de Sheets bajo la cuenta del usuario

El service account puede leer Drive y editar Sheets existentes, pero no debe crear archivos en My Drive. Google indica que las cuentas de servicio no tienen cuota de almacenamiento; para crear archivos en nombre de una persona hay que usar OAuth/delegación. Este pequeño Web App de Apps Script hace únicamente la creación de la Sheet bajo la cuenta del usuario y luego comparte esa Sheet con el service account.

## Configuración única

1. En la cuenta Google que posee los PDFs, abre Google Apps Script y crea un proyecto independiente.
2. Copia `Code.gs` de esta carpeta.
3. En **Project Settings → Script properties**, crea:
   - `ND_BOOTSTRAP_TOKEN` = un token largo aleatorio.
4. Despliega como **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copia la URL `/exec`.
6. En GitHub Actions crea estos dos secrets:

```bash
gh secret set ND_SHEETS_BOOTSTRAP_URL --repo estebanmocho9-lab/ARKON-ND-EXTRACTOR
# pegar la URL /exec cuando la pida

gh secret set ND_SHEETS_BOOTSTRAP_TOKEN --repo estebanmocho9-lab/ARKON-ND-EXTRACTOR
# pegar exactamente el mismo token usado en Script properties
```

No se modifican ni mueven los PDFs fuente. El Web App solo crea/ubica la Sheet en `ARKON ND - SALIDA` y da Editor al service account.
