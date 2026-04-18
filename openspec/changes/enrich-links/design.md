## Context

El pipeline de ingest actual transforma el contenido de los documentos mediante LLM y guarda el raw original. Para notas antiguas del usuario esto no es deseable: el contenido ya es el definitivo, no necesita transformación, y no tiene sentido guardar un raw. El health-check ya tiene la lógica necesaria (`discoverNewLinks`, `applyDiscoveredLinks`) pero es un script monolítico y pesado, no apto para ejecutarse como paso de un workflow ligero.

El sistema de herramientas es modular: `reindex`, `apply-update`, `commit` son scripts independientes invocados como subprocesos. El nuevo script `enrich-links.ts` sigue el mismo patrón.

## Goals / Non-Goals

**Goals:**
- Proporcionar un drop-zone `enrich/` en la raíz con subdirectorios por tipo de documento
- Mover el fichero a `wiki/<tipo>/` sin modificar su contenido
- Añadir la sección `Related` con hasta 5 enlaces descubiertos por búsqueda FTS/semántica
- Preservar los directorios de `enrich/` tras el procesado (solo borrar el fichero)
- Sobreescribir el fichero en wiki si ya existe (el usuario confía en la versión que suelta)

**Non-Goals:**
- Transformación de contenido mediante LLM
- Detección de sinónimos ni merge de notas duplicadas
- Notificaciones Telegram
- Resolución de broken links
- Validación de frontmatter (la nota se acepta tal cual)

## Decisions

### D1: Script dedicado `enrich-links.ts` en lugar de flag en health-check

`health-check.ts` es monolítico y acumula responsabilidades (synonym detection, broken links, stale checks). Añadir flags aumentaría la complejidad. Un script dedicado es más simple, testeable, y sigue el patrón existente del proyecto.

Alternativa descartada: `--only-links --path` en health-check. Frágil y difícil de mantener.

### D2: Las funciones de health-check se duplican de forma reducida en enrich-links

Extraer `discoverNewLinks` y `applyDiscoveredLinks` a un módulo compartido requeriría refactorizar health-check (riesgo de regresión). El script nuevo reimplementa una versión simplificada usando las mismas primitivas (`loadWikiDocs`, `analyzeWikiGraph`, `runToolJson("apply-update")`).

Alternativa descartada: extraer a `lib/link-discovery.ts`. Posible mejora futura, pero fuera de scope.

### D3: Drop-zone en `enrich/` en la raíz, fuera de `raw/`

El trigger del workflow de ingest vigila `/data/vault/raw` recursivamente. Usar `raw/to-enrich/` como drop-zone dispararía ese workflow sobre las notas antiguas, causando una ingestión LLM no deseada. Mover el drop-zone a `enrich/` (raíz del vault) elimina la colisión sin tocar ningún workflow existente.

Alternativas descartadas:
- `raw/to-enrich/` con `ignored` en el trigger de ingest: modifica un workflow en producción
- Guard en "Build Ingest Run Payload": defensivo pero añade lógica de routing en el lugar equivocado

Mapeo: `enrich/concepts/foo.md` → `wiki/concepts/foo.md`. Si la subcarpeta no coincide con ninguna carpeta de wiki conocida, el workflow falla con error explícito.

### D4: El workflow n8n borra solo el fichero, no el directorio

Los directorios en `enrich/` son estructura permanente que el usuario configura una vez. El workflow usa `rm` sobre el fichero concreto, nunca `rmdir`.

## Risks / Trade-offs

- [La nota en wiki/ no tiene backlinks desde otros documentos] → Los backlinks aparecerán en el siguiente health-check completo. Aceptable.
- [Si la nota no está en una subcarpeta reconocida, el workflow falla silenciosamente] → El workflow debe emitir un error claro y no borrar el fichero fuente.
- [Notas sin `type` en frontmatter en subcarpeta no estándar no serán procesadas por discoverNewLinks] → `inferDocType` usa la carpeta, por lo que basta con usar la subcarpeta correcta en `enrich/`.
- [El índice FTS/semántico debe actualizarse antes de discoverNewLinks] → El workflow lanza reindex explícitamente antes de enrich-links.

## Open Questions

- Resuelto: el workflow usa `localFileTrigger` sobre `/data/vault/enrich` con evento `add`, igual que el workflow de ingest sobre `raw/`.
