## Context

El buscador global (`Ctrl+P`) usa el flujo: `global-search-modal.component.ts` → `ApiService.lookupFiles` → `GET /api/files/lookup` (`JobController`) → `FileLookupService.lookup` → `JdbcDocumentIndexRepository.lexicalLookup`. La query actual es un ILIKE con `pg_trgm` sobre `path`, `title` y `body`, ordenado por `similarity`.

La tabla `documents` tiene columnas `id, path, title, doc_type, updated_at, body`, con índices GIN trigram sobre `path`, `title` y `body`. El `body` guarda el markdown **completo, incluyendo el bloque de frontmatter YAML en crudo**. La única propiedad de frontmatter promovida a columna estructurada es `type` → `doc_type` (`WikiDocumentReader`, con fallback por ruta).

El frontmatter del vault (525 notas) es rico y heterogéneo: claves con distinta capitalización (`tags`/`Tags`, `aliases`/`Aliases`), valores escalares (`type: source`) y valores lista (`keywords: [...]`, `tags: [...]`, `Topics: [...]`). `MarkdownService.parse` ya devuelve un `MarkdownDocument` con `frontmatter` como `Map<String, Object>`.

Decisiones de producto ya tomadas (ver proposal): soportar **cualquier** propiedad del frontmatter y comparación **parcial, case/accent-insensitive**, combinando múltiples filtros con AND.

## Goals / Non-Goals

**Goals:**
- Sintaxis `[clave: valor]` estilo Obsidian dentro del mismo input del buscador, mezclable con texto libre.
- Filtrado por cualquier clave de frontmatter (escalar o lista), parcial e insensible a mayúsculas/acentos.
- Índice de frontmatter estructurado y consultable, poblado por reindexado completo e incremental.
- Retrocompatibilidad total del endpoint `/api/files/lookup` cuando no hay filtros.

**Non-Goals:**
- Operadores avanzados de Obsidian (`OR`, `-` negación, comparadores numéricos/fecha, `file:`, `path:`, `line:`). Solo `[clave: valor]` con AND.
- Autocompletado de claves/valores de frontmatter en el input (posible mejora futura).
- Cambiar el ranking/scoring de la búsqueda de texto existente.
- Normalizar la capitalización del frontmatter del vault (se resuelve en la comparación, no reescribiendo notas).

## Decisions

### Decisión 1: Almacenar el frontmatter como columna `JSONB` en `documents`

Añadir `frontmatter JSONB NOT NULL DEFAULT '{}'` a `documents`, poblada desde `MarkdownDocument.frontmatter()`. `WikiDocumentReader.read` ya parsea el markdown; solo hay que propagar el mapa. Serializar con Jackson a texto JSON e insertar con cast `?::jsonb`.

- **Alternativa A (descartada):** filtrar por lexical match sobre el bloque de frontmatter dentro de `body`. Rechazada por imprecisa: un `[status: draft]` matchearía `status: draft` en cualquier parte del cuerpo (bloques de código, texto) y no maneja listas ni límites de valor.
- **Alternativa B (descartada):** tabla lateral `document_frontmatter(document_id, key, value)` normalizada. Más flexible para índices por clave, pero añade joins y complejidad de escritura; JSONB con GIN cubre el caso de este tamaño de vault con menos código.
- **Índice:** `CREATE INDEX ... USING gin (frontmatter)` para acelerar contención; a 525 filas incluso un scan es barato, pero el GIN deja margen.

### Decisión 2: Filtrado en SQL con operadores JSONB + normalización de acentos

Para cada filtro `(clave, valor)` añadir una condición que cubra escalar y lista. Enfoque: sobre `documents.frontmatter`, comparar el valor de la clave (case/accent-insensitive, contains). Como las claves del frontmatter no están normalizadas en capitalización, la resolución de clave se hace **insensible a mayúsculas**: buscar entre las claves del objeto la que coincide con la del filtro ignorando caso.

Estrategia SQL por filtro (una por token), combinada con `AND`:
- Expandir a texto los valores de la clave (escalar → un texto; lista → varios) y comprobar si **alguno** contiene el valor buscado, usando `unaccent(lower(...)) LIKE unaccent(lower('%valor%'))`.
- Implementable con un `EXISTS` sobre `jsonb_each` (para resolver la clave case-insensitive) y `jsonb_array_elements_text`/valor escalar. La construcción de la query es dinámica según el número de filtros (parámetros ligados, sin concatenar valores de usuario).
- Requiere la extensión `unaccent` (verificar en `V1__extensions.sql`; añadirla en la migración si falta).

- **Alternativa (descartada):** resolver la clave exacta (case-sensitive). Rechazada porque `tags` vs `Tags` conviven en el vault y el usuario espera que `[tags: x]` funcione con ambas.

### Decisión 3: Parseo de tokens en el frontend, filtros como parámetros del API

El modal extrae los tokens con una regex `\[\s*([^:\]]+?)\s*:\s*([^\]]*?)\s*\]` sobre el input; lo que queda tras eliminarlos (trim + colapsar espacios) es la consulta de texto. Los filtros se envían al backend como pares clave/valor.

- **Forma del parámetro:** `lookupFiles(q, limit, filters)` donde `filters` es `Record<string,string>` (o lista de pares para permitir claves repetidas). En la request se envían como query params repetidos `fm=clave:valor` (una entrada por filtro) para no chocar con la comparación por subcadena de valores que contengan `:`. El backend recibe `@RequestParam(value="fm", required=false) List<String> fm` y parte cada uno en el **primer** `:`.
- **Retrocompatibilidad:** si `fm` es vacío/ausente, `FileLookupService` llama al `lexicalLookup` actual sin cambios de comportamiento.
- La búsqueda se dispara igual que hoy (debounce 200ms, `distinctUntilChanged`) sobre el input completo; el disparo debe ocurrir también cuando solo hay filtros y no texto libre (hoy `q.trim()` vacío corta la búsqueda — hay que permitir "solo filtros").

### Decisión 4: Semántica de "solo filtros"

Cuando no hay texto libre pero sí filtros, el backend NO aplica el `WHERE title/path/body ILIKE` de texto; solo aplica los filtros de frontmatter y ordena por `path` (o `updated_at DESC`). Cuando hay texto, se conserva el scoring por `similarity` actual y se añaden los filtros como `AND` adicionales.

## Risks / Trade-offs

- **[Requiere reindexado para poblar `frontmatter`]** → Tras desplegar la migración, la columna queda `'{}'` en filas existentes hasta reindexar. Mitigación: ejecutar el reindexado del vault como parte del despliegue (ya existe `vault-reindex`); documentarlo en tasks. Mientras tanto, los filtros simplemente no devuelven coincidencias (degradación segura, no error).
- **[Claves con capitalización inconsistente]** → resuelto por comparación de clave case-insensitive (Decisión 2); coste: no se puede usar el operador `frontmatter->'clave'` directo, hay que iterar con `jsonb_each`. A 525 filas es asumible.
- **[Valores no-texto / anidados]** (ej. `metadata: { tags: [...] }`) → El filtro opera sobre valores escalares y listas de escalares de primer nivel. Propiedades anidadas no se soportan en v1 (coincide con Non-Goals). Riesgo: `[tags: x]` no encontrará `metadata.tags`. Aceptado; el usuario puede usar la clave top-level `tags`.
- **[`unaccent` no es inmutable por defecto]** → No se puede indexar directamente una expresión con `unaccent` sin marcar la función/wrapper como IMMUTABLE. Mitigación: el índice GIN sobre `frontmatter` acelera la resolución de contención; el `unaccent` se aplica en el predicado sin depender de un índice funcional. A este tamaño el rendimiento es suficiente.
- **[Tokens ambiguos en texto libre]** → Si el usuario escribe corchetes literales que no son filtros, la regex podría capturarlos. Mitigación: la regex exige el patrón `clave: valor`; un `[texto]` sin `:` se deja como texto libre.

## Migration Plan

1. **Migración `V41__documents_frontmatter.sql`**: `ALTER TABLE documents ADD COLUMN frontmatter JSONB NOT NULL DEFAULT '{}'`; `CREATE EXTENSION IF NOT EXISTS unaccent` (si no está); `CREATE INDEX idx_documents_frontmatter ON documents USING gin (frontmatter)`.
2. **Backend**: propagar `frontmatter` en `DocumentRecord`, escrituras (`replaceDocuments`, `upsertDocument`) y lectura/filtrado (`lexicalLookup` → nueva firma con filtros). Recompilar (`mvn compile`) y reiniciar el proceso (no hay DevTools — ver memoria de proyecto).
3. **Reindexado**: ejecutar el reindexado completo del vault para poblar `frontmatter` en las 525 notas existentes.
4. **Frontend**: parseo de tokens, chips, `ApiService.lookupFiles` con filtros, traducciones. `ng` recompila en caliente.
5. **Rollback**: los filtros son aditivos y opcionales. Revertir el frontend deja el backend retrocompatible. La columna `frontmatter` puede permanecer (inerte) o eliminarse con una migración de reversión; no afecta a la búsqueda de texto.

## Open Questions

- ¿Orden de resultados en modo "solo filtros": alfabético por `path` o por `updated_at DESC` (más recientes primero)? Propuesta: `updated_at DESC` para reflejar actividad reciente.
- ¿Mostrar los chips como texto no editable derivado del input, o permitir cerrarlos (que edite el input)? Propuesta v1: chips de solo lectura derivados del parseo, sin acción de cierre, para mantener el input como única fuente de verdad.
