## Context

El web-extractor es un microservicio Node.js/Fastify que renderiza páginas con Playwright y convierte el HTML resultante a Markdown mediante Readability + Turndown. El contrato de salida es siempre `{ markdown, metadata }`.

Actualmente el endpoint `/extract` lanza un error si la URL devuelve un `Content-Type` distinto de HTML (`unsupportedContentType`). Los PDFs son un tipo de documento habitual en wikis corporativas y repositorios de conocimiento; sin soporte PDF el pipeline de ingestión no puede procesarlos.

## Goals / Non-Goals

**Goals:**
- Detectar automáticamente PDFs en `/extract` por URL (Content-Type `application/pdf`).
- Añadir `/extract/pdf` para subida directa de fichero PDF (multipart/form-data).
- Extraer texto plano del PDF y devolverlo como Markdown con metadata mínima.
- Límite de tamaño configurable para uploads (default 20 MB).

**Non-Goals:**
- OCR para PDFs escaneados (sólo texto embebido).
- Extracción de imágenes o tablas complejas del PDF.
- Soporte de contraseñas/PDFs cifrados.
- Cambiar el contrato de salida `{ markdown, metadata }`.

## Decisions

### D1 — Biblioteca PDF: `pdf-parse` vs `pdfjs-dist`

**Decisión**: usar `pdf-parse` (wrapper sobre `pdf.js` para Node.js).

**Rationale**:
- API síncrona simple: `pdf(buffer) → { text, numpages, info }`.
- Sin dependencias nativas; funciona en el contenedor Alpine actual.
- Suficiente para texto embebido; la limitación de OCR es aceptable para este caso de uso.
- `pdfjs-dist` requiere worker threads y es significativamente más pesado.

### D2 — Detección de PDF en `/extract` por URL

**Decisión**: descargar el PDF con `fetch` en vez de pasarlo por Playwright.

**Rationale**:
- Playwright no puede devolver el buffer binario del PDF de forma directa.
- `fetch` es suficiente para URLs públicas y evita levantar una página de navegador para contenido no HTML.
- Se mantiene la misma comprobación de `Content-Type` que ya hace `renderer.js`, pero en vez de lanzar error se bifurca al extractor PDF.

**Alternativa descartada**: abrir el PDF en Playwright (el navegador lo renderiza como visor PDF, no devuelve texto extraíble).

### D3 — Nuevo endpoint `/extract/pdf` vs reutilizar `/extract`

**Decisión**: endpoint separado `/extract/pdf` para el upload de fichero.

**Rationale**:
- Multipart/form-data y JSON son body parsers incompatibles en Fastify; mezclarlos en un solo endpoint complica la configuración.
- Semántica clara: `/extract` siempre trabaja con URLs, `/extract/pdf` con ficheros.
- El cliente puede elegir el flujo apropiado sin detección dinámica del content-type del request.

### D4 — Estructura del Markdown generado desde PDF

**Decisión**: texto plano dividido por páginas con separador `---`.

**Rationale**:
- `pdf-parse` devuelve texto crudo sin estructura HTML; no hay Readability que aplicar.
- Separar páginas facilita la partición en chunks en el pipeline de ingestión posterior.
- Alternativa (texto continuo) pierde la noción de páginas que puede ser útil para referencias.

## Risks / Trade-offs

- **PDFs escaneados devuelven texto vacío** → el extractor lanza `empty_content` igual que HTML sin texto; el cliente recibe un error claro. Mitigación: documentar la limitación; OCR queda como mejora futura.
- **PDFs muy grandes consumen mucha memoria** → el límite de 20 MB (configurable) acota el riesgo. Mitigación: el límite se aplica tanto en upload como en fetch por URL.
- **`pdf-parse` tiene vulnerabilidades conocidas en versiones antiguas** → anclar a la versión más reciente y revisar en actualizaciones de dependencias.
- **URLs que sirven PDF de forma dinámica (sin Content-Type correcto)** → el extractor los tratará como HTML y fallará; fuera del alcance de esta iteración.
