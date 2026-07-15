## Why

El web-extractor no puede obtener contenido útil de vídeos de YouTube: el flujo HTML actual (Playwright + Readability) solo captura título y descripción, ignorando la transcripción. Añadir soporte nativo de subtítulos permite ingestar vídeos como fuente de conocimiento igual que páginas web o PDFs.

## What Changes

- Se detectan automáticamente las URLs de YouTube antes del flujo HTML (youtube.com/watch, youtu.be, y variantes).
- Se invoca `yt-dlp` (instalado en el contenedor) para descargar subtítulos auto-generados o manuales en formato VTT/SRT.
- Los subtítulos se convierten a Markdown limpio (texto plano con marcas de tiempo opcionales).
- El endpoint `/extract` existente devuelve el mismo contrato `{ markdown, metadata }` sin cambios de API.
- `yt-dlp` se añade como dependencia del sistema en el `Dockerfile`.

## Capabilities

### New Capabilities

- `youtube-transcript-extraction`: Extracción de transcripciones de YouTube mediante `yt-dlp`. Detecta URLs de YouTube, descarga subtítulos (auto-generados o manuales), limpia el texto VTT/SRT y lo convierte a Markdown estructurado con el título del vídeo como cabecera.

### Modified Capabilities

<!-- ninguna: el contrato /extract no cambia -->

## Impact

- **web-extractor/src/extract.js**: nueva función `extractFromYoutube(url)`
- **web-extractor/src/server.js**: detección de URL de YouTube antes de `isPdfUrl`
- **web-extractor/Dockerfile**: `apt-get install yt-dlp` (o pip install)
- **web-extractor/test/**: nuevos tests unitarios con fixtures VTT
- Sin cambios en el backend Java ni en el frontend Angular
- Dependencia externa: `yt-dlp` (CLI, licencia MIT-compatible)
