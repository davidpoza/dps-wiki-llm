## 1. Infraestructura: yt-dlp en el contenedor

- [x] 1.1 Añadir instalación de `yt-dlp` en `web-extractor/Dockerfile` (via `pip3 install yt-dlp` o `apt`)
- [x] 1.2 Verificar que `yt-dlp --version` funciona dentro del contenedor (smoke test en Dockerfile o compose)

## 2. Detección de URLs de YouTube

- [x] 2.1 Crear función `isYoutubeUrl(url)` en `web-extractor/src/youtube-fetcher.js` que detecte `youtube.com`, `www.youtube.com` y `youtu.be`
- [x] 2.2 Añadir tests unitarios para `isYoutubeUrl` con variantes válidas e inválidas

## 3. Extractor de transcripciones

- [x] 3.1 Implementar `fetchYoutubeTranscript(url)` en `web-extractor/src/youtube-fetcher.js`: invoca `yt-dlp` en un directorio tmp, descarga VTT, retorna `{ vttContent, title, videoUrl }`
- [x] 3.2 Implementar limpieza garantizada del directorio tmp en bloque `finally`
- [x] 3.3 Manejar el caso "sin subtítulos" lanzando `emptyContent()` con mensaje descriptivo
- [x] 3.4 Manejar errores de yt-dlp (vídeo privado, eliminado, timeout) lanzando `ExtractionError`

## 4. Parser VTT → Markdown

- [x] 4.1 Implementar `parseVttToMarkdown(vttContent, title)` en `web-extractor/src/youtube-fetcher.js`: elimina timestamps, cabeceras WEBVTT, etiquetas `<c>`, `<i>`, etc.
- [x] 4.2 Implementar deduplicación de líneas consecutivas idénticas (solapamiento típico de auto-subs)
- [x] 4.3 Formatear salida como `# <título>\n\n<texto limpio>`

## 5. Integración en el servidor

- [x] 5.1 Importar `isYoutubeUrl` y `fetchYoutubeTranscript` en `web-extractor/src/server.js`
- [x] 5.2 Añadir rama YouTube en el handler de `POST /extract` antes de `isPdfUrl`: si `isYoutubeUrl(url)` → llamar a `fetchYoutubeTranscript` y construir respuesta `{ markdown, metadata }`
- [x] 5.3 Asegurar que `metadata` incluye `source`, `title` y `extractionConfidence: 'high'`

## 6. Tests

- [x] 6.1 Añadir fixture VTT de ejemplo en `web-extractor/test/fixtures/sample.vtt`
- [x] 6.2 Escribir tests unitarios de `parseVttToMarkdown` con el fixture (verificar deduplicación, limpieza de tags, formato H1)
- [x] 6.3 Escribir test de integración en `web-extractor/test/extract.test.js` mockeando la invocación de `yt-dlp` para verificar el flujo completo sin red
