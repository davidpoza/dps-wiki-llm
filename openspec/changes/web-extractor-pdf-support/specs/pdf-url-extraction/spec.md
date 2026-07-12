## ADDED Requirements

### Requirement: Extracción de PDF referenciado por URL
El endpoint `POST /extract` SHALL detectar automáticamente cuando la URL apunta a un documento PDF (basándose en el `Content-Type: application/pdf` de la respuesta HTTP) y extraer su texto como Markdown en lugar de renderizarlo con el navegador.

#### Scenario: URL apunta a un PDF válido con texto embebido
- **WHEN** se llama a `POST /extract` con una URL cuya respuesta HTTP tiene `Content-Type: application/pdf`
- **THEN** el sistema devuelve `200` con `{ markdown, metadata }` donde `markdown` contiene el texto extraído del PDF y `metadata` incluye `title`, `pages` y `source`

#### Scenario: URL apunta a un PDF vacío o escaneado sin texto
- **WHEN** se llama a `POST /extract` con una URL a un PDF que no contiene texto extraíble
- **THEN** el sistema devuelve `422` con `{ error: "empty_content" }`

#### Scenario: PDF referenciado por URL supera el límite de tamaño
- **WHEN** se llama a `POST /extract` con una URL a un PDF cuyo tamaño supera el límite configurado (default 20 MB)
- **THEN** el sistema devuelve `413` con `{ error: "payload_too_large" }`

#### Scenario: URL es HTML (comportamiento existente no cambia)
- **WHEN** se llama a `POST /extract` con una URL que devuelve `Content-Type: text/html`
- **THEN** el sistema procesa la URL con el flujo HTML existente (Playwright + Readability)
