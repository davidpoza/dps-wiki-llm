## Why

El web-extractor ya sabe extraer artículos de PubMed Central (PMC) vía la API oficial de NCBI (E-utilities `efetch db=pmc` + parseo JATS), pero esa capacidad se implementó sin ningún change de OpenSpec, por lo que no está documentada como contrato. Además solo cubre URLs `pmc.ncbi.nlm.nih.gov/...`: una URL de PubMed como `https://pubmed.ncbi.nlm.nih.gov/12750433/` no se enruta al fetcher y cae al flujo genérico de Playwright, que solo captura el HTML de la ficha. Como la API de PubMed (`efetch db=pubmed`) **sí** devuelve el abstract y los metadatos incluso de artículos de pago/cerrados, podemos ingestar cualquier artículo indexado en PubMed con datos limpios y estructurados.

## What Changes

- Se documenta retroactivamente el fetcher NCBI/PMC existente (`ncbi-fetcher.js`): detección de URLs PMC, llamada a `efetch db=pmc&rettype=xml` y conversión de JATS XML a Markdown con metadatos (título, autores, fecha, revista, DOI).
- Se añade detección de URLs de PubMed (`pubmed.ncbi.nlm.nih.gov/<PMID>`) en `/extract`, antes del flujo HTML.
- Para una URL de PubMed se llama a `efetch db=pubmed&retmode=xml` y se extraen abstract + metadatos (funciona también para artículos cerrados/de pago).
- Si el registro de PubMed tiene un PMCID propio asociado (subconjunto open access), se salta a `efetch db=pmc` para traer el **texto completo**; si no, se devuelve el **abstract** con `extractionConfidence: "medium"`.
- El endpoint `/extract` mantiene el mismo contrato `{ markdown, metadata }`; no cambia la API ni el backend Java ni el frontend Angular.
- Se refactoriza el fetcher para inyectar `fetch` en tests y se añaden tests unitarios offline con fixtures XML.

## Capabilities

### New Capabilities

- `ncbi-article-extraction`: Extracción de artículos científicos vía la API oficial de NCBI E-utilities. Cubre el flujo PMC ya existente (URLs `pmc.ncbi.nlm.nih.gov`, texto completo desde JATS) y el nuevo flujo PubMed (URLs `pubmed.ncbi.nlm.nih.gov/<PMID>`, abstract + metadatos, con escalado a texto completo PMC cuando el artículo es open access).

### Modified Capabilities

<!-- ninguna: el contrato /extract no cambia y no existía spec previa de NCBI -->

## Impact

- **web-extractor/src/ncbi-fetcher.js**: nuevas funciones `isPubmedUrl(url)` y `fetchPubmedArticle(url)`; refactor de `fetchPmcArticle` para compartir `fetchPmcById(pmcId, sourceUrl)` e inyectar `fetch`.
- **web-extractor/src/server.js**: rama `isPubmedUrl(url)` en `POST /extract`, junto a la rama `isPmcUrl` existente.
- **web-extractor/test/**: nuevo `ncbi.test.js` con fixtures XML (artículo cerrado abstract-only y artículo open access con PMCID).
- Sin cambios en el backend Java (`RawIntakeService`/`WebExtractorClient`) ni en el frontend.
- Dependencia externa: API pública de NCBI E-utilities (`eutils.ncbi.nlm.nih.gov`), ya usada por el flujo PMC.
