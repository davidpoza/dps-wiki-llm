## Context

`web-extractor/src/ncbi-fetcher.js` ya implementa la extracción de artículos PMC: detecta URLs `pmc.ncbi.nlm.nih.gov/articles/PMC…`, llama a NCBI E-utilities `efetch db=pmc&rettype=xml` y convierte el JATS XML a Markdown con `parseJats`. Está enganchado en `POST /extract` (`server.js`) junto a las ramas de YouTube y PDF, y devuelve el contrato común `{ markdown, metadata }`. Esta capacidad nunca se documentó en OpenSpec.

Una URL de PubMed (`pubmed.ncbi.nlm.nih.gov/<PMID>`) no la reconoce `isPmcUrl`, así que hoy cae al flujo de Playwright, que solo captura el HTML de la ficha. La API `efetch db=pubmed` devuelve abstract + metadatos limpios incluso para artículos de pago, por lo que conviene enrutarla también al fetcher de NCBI.

## Goals / Non-Goals

**Goals:**
- Documentar la capacidad NCBI/PMC existente como contrato OpenSpec.
- Aceptar URLs `pubmed.ncbi.nlm.nih.gov/<PMID>` y devolver abstract + metadatos vía `efetch db=pubmed`.
- Escalar automáticamente a texto completo PMC cuando el artículo es open access (tiene PMCID propio).
- Mantener el contrato `{ markdown, metadata }` sin tocar el backend Java ni el frontend.
- Hacer el fetcher testeable offline inyectando `fetch`.

**Non-Goals:**
- Búsqueda por término, autor o rango de fechas (esto es extracción por URL concreta, no un cliente de búsqueda de PubMed/ESearch).
- Descarga de PDFs del editor para artículos de pago (fuera del alcance de E-utilities).
- Resolución de DOIs arbitrarios a PubMed (solo se parte de URLs `pubmed`/`pmc`).

## Decisions

**1. Reutilizar el registro de PubMed para detectar el PMCID propio (sin ELink).**
El XML de `efetch db=pubmed` ya incluye el PMCID del artículo en `PubmedData > ArticleIdList > ArticleId[IdType="pmc"]`. Se usa el combinador de hijo directo para leer **solo** el ID propio del artículo, porque `<ArticleIdList>` también aparece dentro de cada `<Reference>` de la bibliografía (cientos de PMCIDs de referencias). Alternativa descartada: una llamada extra a `elink.fcgi?dbfrom=pubmed&db=pmc` — añade latencia y una petición más a NCBI sin aportar nada que el registro no traiga ya.

**2. Escalado PMC con fallback al abstract.**
Si hay PMCID propio, se llama a `fetchPmcById(pmcId, sourceUrl)` (el mismo camino que las URLs PMC directas) y se devuelve el texto completo. Si esa llamada falla (embargo, error transitorio de NCBI), se cae al abstract ya extraído en lugar de propagar el error: es preferible ingestar el abstract a fallar del todo.

**3. `extractionConfidence`: `high` para texto completo, `medium` para abstract-only.**
Señala aguas abajo (pipeline de ingesta) que el contenido es parcial cuando solo hay abstract, sin cambiar el contrato. El flujo PMC directo y el escalado devuelven `high`.

**4. Refactor mínimo y compartido.**
Se extrae `fetchPmcById(pmcId, sourceUrl, fetchImpl)` para compartir el camino PMC entre la rama de URL PMC directa y el escalado desde PubMed. `parseJats` se mantiene igual. Se inyecta `fetchImpl = _fetch ?? fetch` para poder mockear la red en tests, siguiendo el patrón `_ytDlp` de `youtube-fetcher.js`.

**5. Detección de URL estricta para PubMed.**
`isPubmedUrl` solo hace match si el path contiene un PMID numérico (`/<digits>`), para no capturar páginas de búsqueda o navegación de `pubmed.ncbi.nlm.nih.gov`, que sí deben ir al flujo HTML.

## Risks / Trade-offs

- **Contaminación por IDs de referencias** → Mitigado usando el selector de hijo directo `PubmedData > ArticleIdList` en vez de un `querySelector` global.
- **Rate limiting de NCBI** (sin API key, ~3 req/s por IP) → El flujo escala a como mucho 2 peticiones por artículo (pubmed + pmc); se mantiene el User-Agent identificable y el timeout acotado ya presentes.
- **Fechas heterogéneas** (`PubDate` con `MedlineDate` textual como "2003 Aug", meses como "Aug") → Se prefiere `ArticleDate` numérica (Y-M-D) cuando existe; si no, se compone con lo disponible sin inventar formato.
- **Abstract-only para artículos de pago** → Es una limitación intrínseca: E-utilities no da el cuerpo de artículos cerrados. Se documenta en el spec y se marca con `extractionConfidence: "medium"`.

## Migration Plan

Cambio aditivo y retrocompatible: solo se añade una rama de enrutado en `/extract`. No hay migración de datos ni cambios de API. Rollback = revertir el commit; las URLs de PubMed volverían al flujo de Playwright.
