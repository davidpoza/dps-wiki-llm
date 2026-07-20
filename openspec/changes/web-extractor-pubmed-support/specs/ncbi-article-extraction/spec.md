## ADDED Requirements

### Requirement: Detección automática de URLs de PMC
El endpoint `/extract` SHALL detectar automáticamente cuando la URL pertenece a PubMed Central (`pmc.ncbi.nlm.nih.gov/articles/PMC<digits>`) y enrutar la solicitud al fetcher de NCBI en lugar del flujo HTML de Playwright.

#### Scenario: URL de artículo PMC detectada
- **WHEN** se llama a `POST /extract` con `{ "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10390700/" }`
- **THEN** el sistema SHALL enrutar la solicitud al fetcher de NCBI y NO invocar Playwright

#### Scenario: URL no-NCBI no afectada
- **WHEN** se llama a `POST /extract` con `{ "url": "https://example.com/article" }`
- **THEN** el sistema SHALL usar el flujo HTML estándar (Playwright + Readability)

### Requirement: Extracción de texto completo PMC vía E-utilities
El sistema SHALL obtener el artículo completo llamando a la API oficial de NCBI E-utilities `efetch` con `db=pmc`, `rettype=xml` y `retmode=xml`, usando un User-Agent identificable y un timeout acotado.

#### Scenario: Descarga de JATS XML
- **WHEN** se resuelve un PMCID a partir de la URL
- **THEN** el sistema SHALL solicitar `efetch.fcgi?db=pmc&id=<PMCID>&rettype=xml&retmode=xml`

#### Scenario: Error de la API de NCBI
- **WHEN** la API de NCBI responde con un estado HTTP de error para el PMCID
- **THEN** el sistema SHALL propagar el fallo en lugar de devolver contenido vacío

### Requirement: Conversión de JATS XML a Markdown estructurado
El sistema SHALL convertir el JATS XML del artículo a Markdown, incluyendo el abstract bajo un encabezado `## Abstract` y el cuerpo con sus secciones (`sec`/`title`), párrafos, listas y leyendas de tablas y figuras.

#### Scenario: Artículo con abstract y cuerpo
- **WHEN** el JATS contiene `<abstract>` y `<body>`
- **THEN** el Markdown resultante SHALL comenzar con `## Abstract` seguido del cuerpo convertido a Markdown

#### Scenario: Artículo sin contenido extraíble
- **WHEN** el JATS no produce ningún Markdown útil
- **THEN** el sistema SHALL devolver HTTP 422 con `{ "error": "empty_content", ... }`

### Requirement: Detección automática de URLs de PubMed
El endpoint `/extract` SHALL detectar automáticamente cuando la URL pertenece a PubMed (`pubmed.ncbi.nlm.nih.gov/<PMID>`) y enrutar la solicitud al fetcher de PubMed antes del flujo HTML.

#### Scenario: URL de PubMed con PMID detectada
- **WHEN** se llama a `POST /extract` con `{ "url": "https://pubmed.ncbi.nlm.nih.gov/12750433/" }`
- **THEN** el sistema SHALL enrutar la solicitud al fetcher de PubMed y NO invocar Playwright

#### Scenario: URL de PubMed sin PMID numérico
- **WHEN** se llama a `POST /extract` con una URL de dominio `pubmed.ncbi.nlm.nih.gov` que no contiene un PMID numérico (p. ej. `/?term=lupus`)
- **THEN** el sistema NO SHALL tratarla como artículo de PubMed y SHALL usar el flujo HTML estándar

### Requirement: Extracción de abstract y metadatos de PubMed
El sistema SHALL obtener el registro llamando a `efetch` con `db=pubmed` y `retmode=xml`, y extraer título, autores, revista, fecha de publicación, idioma, DOI y abstract, incluso para artículos de pago/cerrados que no tienen texto completo en abierto.

#### Scenario: Artículo cerrado con abstract disponible
- **WHEN** el PMID corresponde a un artículo de pago cuyo registro de PubMed incluye `<AbstractText>`
- **THEN** el sistema SHALL devolver el abstract en Markdown bajo `## Abstract` junto con los metadatos del artículo

#### Scenario: Abstract estructurado con secciones etiquetadas
- **WHEN** el registro contiene varios `<AbstractText>` con atributo `Label` (p. ej. BACKGROUND, METHODS, RESULTS)
- **THEN** el Markdown del abstract SHALL preservar cada sección con su etiqueta en negrita

#### Scenario: Registro sin abstract
- **WHEN** el registro de PubMed no contiene ningún `<AbstractText>` y el artículo no tiene texto completo en PMC
- **THEN** el sistema SHALL devolver HTTP 422 con `{ "error": "empty_content", ... }`

### Requirement: Escalado a texto completo PMC para artículos open access
Cuando el registro de PubMed incluye un PMCID propio (subconjunto open access), el sistema SHALL obtener el texto completo desde PMC (`db=pmc`) en lugar de quedarse con el abstract. La detección del PMCID SHALL usar únicamente el identificador propio del artículo (`PubmedData > ArticleIdList`), nunca los identificadores de las referencias bibliográficas.

#### Scenario: Artículo open access con PMCID propio
- **WHEN** el registro de PubMed contiene un `<ArticleId IdType="pmc">` en la lista de IDs del propio artículo
- **THEN** el sistema SHALL obtener y devolver el texto completo desde PMC con `extractionConfidence: "high"`

#### Scenario: Los PMCID de las referencias no disparan el escalado
- **WHEN** el registro solo contiene PMCIDs dentro de `<ReferenceList>` pero no un PMCID propio del artículo
- **THEN** el sistema NO SHALL intentar obtener texto completo y SHALL devolver el abstract

#### Scenario: Fallback si PMC falla
- **WHEN** existe un PMCID propio pero la obtención del texto completo en PMC falla
- **THEN** el sistema SHALL devolver el abstract ya extraído en lugar de fallar

### Requirement: Contrato de respuesta y confianza de extracción
El endpoint `/extract` SHALL devolver el mismo objeto `{ markdown, metadata }` para artículos de NCBI que para el resto de contenidos. El campo `metadata.extractionConfidence` SHALL ser `"high"` cuando se devuelve texto completo (PMC) y `"medium"` cuando solo se devuelve el abstract de PubMed.

#### Scenario: Metadatos del artículo
- **WHEN** se extrae correctamente un artículo de NCBI
- **THEN** `metadata` SHALL incluir `finalUrl`, `canonicalUrl` (DOI si está disponible), `title`, `author`, `published`, `siteName` (revista) y `lang`

#### Scenario: Confianza para abstract-only
- **WHEN** se devuelve únicamente el abstract de un artículo de PubMed sin texto completo
- **THEN** `metadata.extractionConfidence` SHALL ser `"medium"`

#### Scenario: URL canónica desde DOI
- **WHEN** el registro incluye un DOI
- **THEN** `metadata.canonicalUrl` SHALL ser `https://doi.org/<DOI>`
