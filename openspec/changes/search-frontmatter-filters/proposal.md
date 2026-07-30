## Why

El modal de búsqueda global solo filtra por texto sobre `path`, `title` y `body`, por lo que no permite acotar resultados por metadatos estructurados del frontmatter (tipo de nota, autor, tags, estado…). Con 525 notas y un frontmatter rico pero heterogéneo, encontrar "las fuentes sobre productividad" o "las notas de tipo topic" exige recordar el nombre exacto del archivo. Adoptar la sintaxis de propiedades de Obsidian `[clave: valor]` dentro del mismo cuadro de búsqueda da a los usuarios un filtrado familiar y potente sin salir del flujo actual.

## What Changes

- El input del modal de búsqueda acepta uno o varios tokens `[clave: valor]` mezclados con texto libre (ej. `productividad [type: source] [author: David]`). Los tokens se extraen como filtros de frontmatter y el resto se trata como consulta de texto.
- El backend indexa el frontmatter completo de cada nota como datos estructurados (columna JSONB en `documents`) durante el reindexado e indexado incremental, además del `body` en crudo que ya se guarda.
- El endpoint `GET /api/files/lookup` acepta filtros de propiedades de frontmatter y devuelve solo las notas cuyo frontmatter satisface **todos** los filtros (AND), combinados con la búsqueda de texto existente.
- La comparación de valores es **parcial e insensible a mayúsculas/acentos** (ej. `[type: sou]` coincide con `source`; `[tags: Prod]` coincide con `productivity`). Para propiedades cuyo valor es una lista (ej. `tags`, `keywords`), el filtro coincide si **algún** elemento de la lista contiene el valor.
- El modal ofrece feedback visual de los filtros activos (chips) y maneja el caso de solo-filtros sin texto libre.

## Capabilities

### New Capabilities
- `search-frontmatter-filters`: Parseo de la sintaxis `[clave: valor]` estilo Obsidian en el buscador, indexado estructurado del frontmatter y filtrado del lookup de archivos por propiedades de frontmatter combinado con búsqueda de texto.

### Modified Capabilities
<!-- El comportamiento existente de global-search-modal (Ctrl+P, navegación, descarte de cambios, búsqueda por texto) se preserva sin cambios de requisito; la nueva sintaxis se añade como capacidad aditiva. -->

## Impact

- **Backend**
  - Migración Flyway nueva (V41): añade columna `frontmatter JSONB` a `documents` con índice GIN.
  - `WikiDocumentReader` / `DocumentRecord`: incluir el frontmatter parseado.
  - `JdbcDocumentIndexRepository` (`replaceDocuments`, `upsertDocument`, `lexicalLookup`): persistir y filtrar por `frontmatter`.
  - `FileLookupService`, `SearchResult`, controlador `/files/lookup`: aceptar y propagar los filtros.
  - Requiere reindexado del vault para poblar la nueva columna (525 notas).
- **Frontend**
  - `global-search-modal.component.ts`: parseo de tokens `[clave: valor]`, UI de chips de filtro.
  - `api.service.ts`: `lookupFiles` envía los filtros de frontmatter.
  - Traducciones (Transloco) para textos nuevos del modal.
- **Sin cambios rompedores** en la API existente: los filtros son parámetros opcionales; las llamadas sin filtros se comportan igual que hoy.
