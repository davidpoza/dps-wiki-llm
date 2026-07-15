## Why

El web-extractor sólo puede procesar páginas HTML; los documentos PDF —frecuentes en wikis y repositorios de conocimiento— quedan fuera del pipeline de ingestión. Añadir soporte PDF permite ampliar las fuentes de datos sin cambiar el contrato de salida (`markdown` + `metadata`).

## What Changes

- Nuevo endpoint `POST /extract/pdf` que acepta un fichero PDF subido como `multipart/form-data`.
- El endpoint `POST /extract` detecta automáticamente si la URL apunta a un PDF (por `Content-Type: application/pdf`) y lo procesa como PDF en vez de HTML.
- Se añade un extractor de texto PDF que convierte el contenido a Markdown y extrae metadata básica (título, autor, número de páginas).
- Se añade validación del tamaño máximo del fichero subido (configurable, por defecto 20 MB).

## Capabilities

### New Capabilities

- `pdf-url-extraction`: Extracción automática de PDFs referenciados por URL dentro del endpoint `/extract` existente.
- `pdf-upload-extraction`: Nuevo endpoint `/extract/pdf` para subir un fichero PDF directamente y obtener markdown + metadata.

### Modified Capabilities

<!-- No existing spec-level requirements change; only implementation is extended. -->

## Impact

- **web-extractor/src/server.js**: nuevo endpoint `/extract/pdf`, multipart plugin, detección de content-type PDF en `/extract`.
- **web-extractor/src/extract.js**: nueva función `extractFromPdf(buffer)`.
- **web-extractor/src/renderer.js**: retorna el buffer del PDF cuando el content-type es `application/pdf`, sin pasar por el browser.
- **web-extractor/package.json**: nueva dependencia para parseo de PDF (e.g. `pdf-parse` o `pdfjs-dist`).
- **web-extractor/Dockerfile**: posibles dependencias nativas si se elige `pdfjs-dist`.
- Sin cambios en el contrato de salida: siempre `{ markdown, metadata }`.
