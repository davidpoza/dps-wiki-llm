## Context

El web-extractor es un microservicio Node.js (Fastify) que expone `/extract` para convertir URLs a Markdown. Actualmente soporta HTML (vía Playwright) y PDF. Las URLs de YouTube pasarían por el flujo HTML y devolverían solo título + descripción, sin transcripción.

`yt-dlp` es una CLI Python madura que soporta descarga de subtítulos de YouTube (auto-generados y manuales) en VTT, SRT y JSON3. Es la herramienta estándar de facto para este propósito.

El servicio corre en Docker; añadir `yt-dlp` al contenedor es trivial.

## Goals / Non-Goals

**Goals:**
- Detectar automáticamente URLs de YouTube (youtube.com/watch, youtu.be) en `/extract`
- Usar `yt-dlp` para descargar subtítulos (auto-generados si no hay manuales)
- Convertir el VTT/SRT resultante a Markdown limpio con el título del vídeo
- Mantener el mismo contrato `{ markdown, metadata }` del endpoint `/extract`
- Tests unitarios con fixtures VTT reales

**Non-Goals:**
- Descargar audio o vídeo
- Soporte de playlists de YouTube
- Soporte de otras plataformas de vídeo (Vimeo, Twitch, etc.) — aunque yt-dlp las soporta, queda fuera del alcance
- Traducción de subtítulos

## Decisions

### 1. `yt-dlp` como CLI, no como librería Python

**Decisión**: invocar `yt-dlp` como proceso hijo via `child_process.spawn` desde Node.js.

**Rationale**: No existe binding oficial de yt-dlp para Node.js. Las alternativas (`ytdl-core`, `youtube-transcript`) están desactualizadas o dependen de scraping frágil de la web de YouTube. `yt-dlp` es robusto y mantenido activamente.

**Alternativa descartada**: `youtube-transcript` npm — depende de scraping HTML y se rompe frecuentemente con cambios de YouTube.

### 2. Formato de subtítulos: VTT → texto plano

**Decisión**: descargar en formato VTT (`--write-auto-subs --sub-format vtt --skip-download`), luego parsear con regex para extraer solo el texto eliminando timestamps y etiquetas.

**Rationale**: VTT es el formato más limpio para extraer solo texto. JSON3 tiene más metadatos pero es más complejo de parsear. SRT es similar a VTT pero menos estándar en yt-dlp.

**Salida Markdown**:
```
# <título del vídeo>

<transcripción como párrafos limpios, deduplicando líneas solapadas propias del VTT>
```

### 3. Ficheros temporales en `/tmp`

**Decisión**: escribir los subtítulos en un directorio temporal (`fs.mkdtemp`) y limpiar en el bloque `finally`.

**Rationale**: `yt-dlp` requiere escribir a disco. Usar tmp directory garantiza aislamiento entre llamadas concurrentes y limpieza garantizada.

### 4. Detección de URL de YouTube

**Decisión**: función `isYoutubeUrl(url)` que comprueba `hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'youtu.be'`.

**Rationale**: Simple, sin regex compleja, cubre los casos de uso reales. No se intentan detectar otros dominios de Google Video.

### 5. Idioma de subtítulos

**Decisión**: intentar primero el idioma del vídeo detectado por yt-dlp (`--sub-langs all,-live_chat`), priorizando `es,en` como fallback explícito.

**Rationale**: Los usuarios ingestan contenido en cualquier idioma. Forzar solo inglés o español sería restrictivo.

## Risks / Trade-offs

- **[Risk] yt-dlp puede fallar si YouTube cambia su API** → Mitigation: `yt-dlp` se actualiza frecuentemente; el Dockerfile puede fijar versión mínima y el error se propaga como `ExtractionError` con mensaje claro.
- **[Risk] Vídeos sin subtítulos disponibles** → Mitigation: devolver error `empty_content` con mensaje descriptivo ("No subtitles available for this video").
- **[Risk] Latencia alta** → Mitigation: `yt-dlp --skip-download` solo baja el archivo VTT (KB), no el vídeo. La operación es rápida (< 5s típicamente).
- **[Risk] Vídeos privados o con DRM** → Mitigation: yt-dlp falla con código de error; se propaga como `ExtractionError`.

## Migration Plan

1. Añadir `yt-dlp` al `Dockerfile` (instalación via pip o apt).
2. Añadir `youtube-fetcher.js` con la lógica de invocación y parseo VTT.
3. Modificar `server.js` para detectar YouTube antes de `isPdfUrl`.
4. Añadir tests con fixtures VTT.
5. Rebuild de la imagen Docker; sin cambios de schema de BD ni de API.

Rollback: revertir los 3 ficheros modificados; la imagen anterior sigue funcionando.

## Open Questions

- ¿Se deben incluir timestamps en el Markdown o solo texto limpio? (Decisión actual: solo texto limpio para máxima densidad de información.)
- ¿Timeout configurable para yt-dlp? (Decisión actual: 60s, heredado de `config.js`.)
