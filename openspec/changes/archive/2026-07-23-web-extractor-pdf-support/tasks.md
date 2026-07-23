## 1. Dependencias y configuración

- [x] 1.1 Añadir `pdf-parse` a `web-extractor/package.json` y ejecutar `npm install`
- [x] 1.2 Añadir `@fastify/multipart` a `web-extractor/package.json` para soporte de file upload
- [x] 1.3 Añadir `PDF_MAX_BYTES` a `web-extractor/src/config.js` con valor por defecto 20 971 520

## 2. Extractor de PDF

- [x] 2.1 Crear función `extractFromPdf(buffer)` en `web-extractor/src/extract.js` que use `pdf-parse` para extraer texto y metadata (título, número de páginas)
- [x] 2.2 Implementar conversión del texto extraído a Markdown con separadores `---` entre páginas
- [x] 2.3 Lanzar `emptyContent()` si el texto extraído está vacío tras trimming
- [x] 2.4 Devolver `{ markdown, metadata }` con `metadata.pages`, `metadata.title` (de `info.Title` del PDF si existe) y `metadata.extractionConfidence: 'high'`

## 3. Descarga de PDF por URL

- [x] 3.1 Crear función `fetchPdf(url)` en `web-extractor/src/renderer.js` (o nuevo `pdf-fetcher.js`) que descargue el PDF con `fetch`, respetando el límite `PDF_MAX_BYTES`, y devuelva el buffer
- [x] 3.2 Añadir error `payloadTooLarge()` en `web-extractor/src/errors.js` con status 413 y código `payload_too_large`
- [x] 3.3 En `web-extractor/src/server.js`, en el handler de `POST /extract`, detectar `Content-Type: application/pdf` tras el primer HEAD/GET y bifurcar al flujo PDF

## 4. Endpoint de upload `/extract/pdf`

- [x] 4.1 Registrar `@fastify/multipart` en la app de Fastify en `web-extractor/src/server.js`
- [x] 4.2 Añadir `POST /extract/pdf` que lea el campo `file` del multipart, valide que el mime type sea `application/pdf` y que el tamaño no supere `PDF_MAX_BYTES`
- [x] 4.3 Llamar a `extractFromPdf(buffer)` y devolver `{ markdown, metadata }` añadiendo `metadata.source = 'upload'` y `metadata.filename`
- [x] 4.4 Devolver `400 invalid_input` si el campo `file` está ausente o no es PDF

## 5. Tests

- [x] 5.1 Añadir tests unitarios para `extractFromPdf` en `web-extractor/test/extract.test.js` con un PDF de fixture pequeño
- [x] 5.2 Añadir test de integración para `POST /extract/pdf` en `web-extractor/test/server.test.js` usando `app.inject` con un buffer PDF
- [x] 5.3 Añadir test para el límite de tamaño (`PDF_MAX_BYTES`) en upload y en URL
- [x] 5.4 Verificar que `POST /extract` con URL HTML sigue funcionando (regresión)

## 6. Documentación y Docker

- [x] 6.1 Verificar que el `Dockerfile` de `web-extractor` no requiere cambios (pdf-parse no necesita dependencias nativas adicionales)
- [x] 6.2 Añadir `PDF_MAX_BYTES` a `secrets.yml` o al `.env.example` del proyecto si existe
