## ADDED Requirements

### Requirement: Detección automática de URLs de YouTube
El endpoint `/extract` SHALL detectar automáticamente cuando la URL proporcionada pertenece a YouTube (dominios `youtube.com`, `www.youtube.com`, `youtu.be`) y enrutar la solicitud al extractor de transcripciones en lugar del flujo HTML estándar.

#### Scenario: URL de youtube.com/watch detectada
- **WHEN** se llama a `POST /extract` con `{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }`
- **THEN** el sistema SHALL enrutar la solicitud al extractor de transcripciones y NO invocar Playwright

#### Scenario: URL de youtu.be detectada
- **WHEN** se llama a `POST /extract` con `{ "url": "https://youtu.be/dQw4w9WgXcQ" }`
- **THEN** el sistema SHALL enrutar la solicitud al extractor de transcripciones

#### Scenario: URL no-YouTube no afectada
- **WHEN** se llama a `POST /extract` con `{ "url": "https://example.com/article" }`
- **THEN** el sistema SHALL usar el flujo HTML estándar (Playwright + Readability)

### Requirement: Extracción de subtítulos con yt-dlp
El sistema SHALL invocar `yt-dlp` como proceso hijo para descargar los subtítulos del vídeo (auto-generados o manuales) en formato VTT, sin descargar el archivo de vídeo.

#### Scenario: Subtítulos disponibles
- **WHEN** el vídeo tiene subtítulos (manuales o auto-generados) disponibles
- **THEN** el sistema SHALL descargar el archivo VTT con `yt-dlp --write-auto-subs --write-subs --skip-download --sub-format vtt`

#### Scenario: Sin subtítulos disponibles
- **WHEN** el vídeo no tiene subtítulos de ningún tipo disponibles
- **THEN** el sistema SHALL devolver HTTP 422 con `{ "error": "empty_content", "message": "No subtitles available for this video" }`

#### Scenario: Vídeo privado o inaccesible
- **WHEN** yt-dlp no puede acceder al vídeo (privado, eliminado, DRM)
- **THEN** el sistema SHALL devolver HTTP 422 con `{ "error": "extraction_failed", "message": "..." }` con el mensaje de error de yt-dlp

### Requirement: Conversión de VTT a Markdown limpio
El sistema SHALL convertir el archivo VTT descargado a Markdown eliminando timestamps, etiquetas HTML internas del VTT y líneas duplicadas solapadas. El resultado SHALL comenzar con el título del vídeo como encabezado H1.

#### Scenario: Formato del Markdown resultante
- **WHEN** se extrae correctamente la transcripción
- **THEN** el Markdown resultante SHALL tener la estructura: `# <título del vídeo>\n\n<transcripción como texto continuo>`

#### Scenario: Deduplicación de líneas solapadas
- **WHEN** el VTT contiene líneas duplicadas (típico de subtítulos auto-generados con solapamiento)
- **THEN** el sistema SHALL deduplicar líneas consecutivas idénticas, manteniendo una sola aparición

#### Scenario: Eliminación de timestamps y etiquetas
- **WHEN** el VTT contiene cabeceras de timestamp (`00:00:01.000 --> 00:00:03.000`) y etiquetas como `<c>`, `<i>`
- **THEN** el Markdown resultante NO SHALL contener timestamps ni etiquetas VTT

### Requirement: Contrato de respuesta consistente con otros extractores
El endpoint `/extract` SHALL devolver el mismo objeto `{ markdown, metadata }` para URLs de YouTube que para otros tipos de contenido.

#### Scenario: Respuesta exitosa de YouTube
- **WHEN** se extrae correctamente la transcripción de un vídeo
- **THEN** la respuesta SHALL ser `{ "markdown": "# Título\n\n...", "metadata": { "source": "<url>", "title": "<título>", "extractionConfidence": "high" } }`

#### Scenario: Campo source en metadata
- **WHEN** se devuelve la metadata de un vídeo de YouTube
- **THEN** `metadata.source` SHALL ser la URL canónica del vídeo (`https://www.youtube.com/watch?v=<id>`)

### Requirement: Limpieza de ficheros temporales garantizada
El sistema SHALL eliminar todos los ficheros temporales creados por yt-dlp (directorio tmp y archivos VTT) independientemente de si la extracción fue exitosa o falló.

#### Scenario: Limpieza tras extracción exitosa
- **WHEN** la extracción de subtítulos se completa correctamente
- **THEN** el directorio temporal creado durante la extracción SHALL ser eliminado

#### Scenario: Limpieza tras error de yt-dlp
- **WHEN** yt-dlp falla con un error
- **THEN** el directorio temporal SHALL ser eliminado antes de propagar el error
