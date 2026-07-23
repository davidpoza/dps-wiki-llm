# pdf-upload-extraction Specification

## Purpose
TBD - created by archiving change web-extractor-pdf-support. Update Purpose after archive.
## Requirements
### Requirement: Subida directa de fichero PDF
El sistema SHALL exponer el endpoint `POST /extract/pdf` que acepta un fichero PDF mediante `multipart/form-data` y devuelve su contenido como Markdown con metadata.

#### Scenario: Subida de PDF válido con texto embebido
- **WHEN** se realiza `POST /extract/pdf` con un campo `file` de tipo `multipart/form-data` que contiene un PDF con texto
- **THEN** el sistema devuelve `200` con `{ markdown, metadata }` donde `metadata` incluye `title`, `pages`, `source: "upload"` y `filename`

#### Scenario: Subida de PDF vacío o sin texto extraíble
- **WHEN** se realiza `POST /extract/pdf` con un PDF que no contiene texto embebido
- **THEN** el sistema devuelve `422` con `{ error: "empty_content" }`

#### Scenario: Fichero subido supera el límite de tamaño
- **WHEN** se realiza `POST /extract/pdf` con un fichero cuyo tamaño supera el límite configurado (default 20 MB)
- **THEN** el sistema devuelve `413` con `{ error: "payload_too_large" }`

#### Scenario: El campo `file` está ausente o no es un PDF
- **WHEN** se realiza `POST /extract/pdf` sin el campo `file`, o con un fichero cuyo `Content-Type` no es `application/pdf`
- **THEN** el sistema devuelve `400` con `{ error: "invalid_input" }`

### Requirement: Límite de tamaño de PDF configurable
El sistema SHALL leer el límite máximo de tamaño de PDF desde la variable de entorno `PDF_MAX_BYTES` y SHALL aplicarlo tanto a uploads como a descargas por URL. El valor por defecto SHALL ser 20 971 520 bytes (20 MB).

#### Scenario: Variable de entorno define el límite
- **WHEN** `PDF_MAX_BYTES=5242880` está definida en el entorno
- **THEN** el sistema rechaza PDFs mayores de 5 MB con `413`

#### Scenario: Sin variable de entorno se usa el valor por defecto
- **WHEN** `PDF_MAX_BYTES` no está definida
- **THEN** el límite efectivo es 20 MB

