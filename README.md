# Alaska Wild Lights — Reviews Dashboard

Sistema que corre solo cada semana. Vos solo tenés que subir un archivo al dashboard.

## Flujo semanal

```
Domingo (automático):
  Apps Script corre
    ├─ Scrapea Google Maps + TripAdvisor via Apify
    ├─ Acumula historia (monthly + weekly + byGuide)
    ├─ Guarda data.json en Google Drive (backend)
    └─ Te emaila el data.json como adjunto a awlsaray@gmail.com

Vos (30 segundos):
  1. Abrís el email con asunto "AKWL Weekly Reviews — ... · Dashboard data attached"
  2. Descargás el adjunto akwl-reviews-data.json
  3. Abrís el dashboard en Netlify (la URL pública)
  4. Click "↑ Upload data.json" → seleccionás el archivo
  5. Listo. El navegador lo guarda localmente, no tenés que hacerlo de nuevo si volvés a abrir.
```

## Setup inicial (una vez)

### 1. Deploy a Netlify
1. Abrí <https://app.netlify.com/drop>
2. Arrastrá `index.html` → Netlify te da una URL pública
3. Guardá esa URL — es donde abrirás el dashboard cada semana

### 2. Configurá el Apps Script
1. Abrí Google Apps Script (Extensions → Apps Script desde Google Sheets)
2. Pegá el contenido de `WeeklyReviewsEngine.gs` v4.12 (reemplaza el actual)
3. Project Settings → Script Properties → agregá:
   - `DASHBOARD_URL` = la URL de Netlify que te dieron
4. Triggers (⏰) → "Add Trigger":
   - Function: `runWeeklyReport`
   - Event: Time-driven, Week timer, Sunday, hora a tu gusto
5. Save

Listo. La primera vez que corra, va a:
- Crear el archivo `akwl-reviews-data.json` en tu Google Drive
- Guardar el ID en Script Properties (`DRIVE_FILE_ID`)
- Emailarte el primer adjunto

## Archivos del repo

| Archivo | Para qué |
|---|---|
| `index.html` | El dashboard. Drag-and-drop a Netlify una vez. |
| `index.template.html` | Template del dashboard (placeholder `/*__DATA_JSON__*/`). |
| `data.json` | Snapshot inicial baked-in al index.html (Jan-Abr histórico). |
| `WeeklyReviewsEngine.gs` | El script de Apps Script que corre cada domingo. |

## Backend (estado persistente)

El `data.json` con TODA la historia acumulada vive en **tu Google Drive** (archivo `akwl-reviews-data.json`). Cada domingo el script:
1. Lo lee de Drive
2. Le agrega la semana actual
3. Lo guarda devuelta en Drive
4. Te lo emaila como adjunto

No depende de GitHub Pages (cache), no depende de servidores externos, no depende de tokens que expiren. Solo Apps Script + Drive + tu navegador.

## Si algo se rompe

- **Email no llegó**: Revisá Apps Script → Executions, ver el último run
- **Adjunto vacío**: Verificá que `DRIVE_FILE_ID` esté en Script Properties
- **Dashboard muestra data vieja**: Click el botón "↺ Reset" para limpiar localStorage, luego subí el archivo nuevo
- **Quiero re-correr la semana**: Apps Script → seleccionar `runWeeklyReport` → Run

## Próximos pasos opcionales

- **Auto-deploy Netlify desde GitHub**: configurar deploy desde repo para no draggar `index.html` nunca más (solo cuando cambia el template)
- **Bootstrap May 2026 con data real**: correr `bootstrap_SeedMonthlyMay2026()` (si existe) para sembrar las semanas de mayo previas al primer run
