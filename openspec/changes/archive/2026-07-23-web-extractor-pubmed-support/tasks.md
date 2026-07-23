## 1. Refactor del fetcher NCBI/PMC existente

- [x] 1.1 Extraer `fetchPmcById(pmcId, sourceUrl, fetchImpl)` en `web-extractor/src/ncbi-fetcher.js` con la lógica actual de `efetch db=pmc` + `parseJats`
- [x] 1.2 Reescribir `fetchPmcArticle(url, opts)` para extraer el PMCID y delegar en `fetchPmcById`, aceptando `{ _fetch }` para inyección en tests
- [x] 1.3 Introducir `fetchImpl = _fetch ?? fetch` en todas las llamadas de red del módulo

## 2. Detección de URLs de PubMed

- [x] 2.1 Añadir `isPubmedUrl(url)` que haga match solo con `pubmed.ncbi.nlm.nih.gov/<PMID numérico>`
- [x] 2.2 Añadir `extractPmid(url)` que devuelva el PMID o `null`

## 3. Extractor de PubMed

- [x] 3.1 Implementar `fetchPubmedArticle(url, { _fetch })`: llama a `efetch db=pubmed&retmode=xml` y parsea el registro
- [x] 3.2 Implementar `parsePubmed(xml, sourceUrl)`: título, autores, revista, fecha (prefiere `ArticleDate` numérica), idioma, DOI y PMCID propio vía `PubmedData > ArticleIdList > ArticleId[IdType="pmc"]`
- [x] 3.3 Construir el Markdown del abstract bajo `## Abstract`, preservando secciones etiquetadas (`AbstractText[Label]`) en negrita
- [x] 3.4 Si hay PMCID propio → llamar a `fetchPmcById` para texto completo (`extractionConfidence: "high"`); si falla, fallback al abstract
- [x] 3.5 Si no hay PMCID → devolver abstract con `extractionConfidence: "medium"`; si no hay abstract ni PMC → lanzar `emptyContent()`

## 4. Integración en el servidor

- [x] 4.1 Importar `isPubmedUrl` y `fetchPubmedArticle` en `web-extractor/src/server.js`
- [x] 4.2 Añadir la rama `isPubmedUrl(url)` en `POST /extract` junto a la rama `isPmcUrl`

## 5. Tests

- [x] 5.1 Añadir fixtures XML en `web-extractor/test/fixtures/`: `pubmed-abstract-only.xml` (cerrado, con PMCID solo en una referencia), `pubmed-open-access.xml` (con PMCID propio) y `pmc-fulltext.xml` (JATS de texto completo)
- [x] 5.2 Tests de `isPubmedUrl`/`isPmcUrl` con variantes válidas e inválidas (incluida URL de búsqueda sin PMID)
- [x] 5.3 Test de `fetchPubmedArticle` para artículo cerrado (mock `_fetch`): devuelve abstract, metadatos y `extractionConfidence: "medium"`
- [x] 5.4 Test de `fetchPubmedArticle` para artículo open access (mock `_fetch`): escala a PMC, devuelve texto completo y `extractionConfidence: "high"`
- [x] 5.5 Test de fallback: PMCID propio presente pero `db=pmc` falla → devuelve abstract
- [x] 5.6 Test de que los PMCID de referencias no disparan el escalado

## 6. Verificación

- [x] 6.1 Ejecutar `node --test` en `web-extractor/` y confirmar que toda la suite pasa
- [x] 6.2 Smoke test manual contra la API real con un PMID cerrado y uno open access
