## Why

El usuario tiene notas antiguas que no siguen el formato actual del pipeline de ingest, y quiere incorporarlas al wiki sin que su contenido sea modificado por el LLM, y sin guardar el raw original. El pipeline actual no tiene un camino para esto: o bien pasa por ingest completo (transforma contenido, guarda raw) o bien hay que copiar a mano y lanzar el health-check completo.

## What Changes

- Nuevo directorio drop-zone `raw/to-enrich/` con subdirectorios permanentes por tipo (`concepts/`, `topics/`, `entities/`, `analyses/`)
- Nuevo script `tools/enrich-links.ts` que acepta uno o más paths de wiki, descubre enlaces relacionados y añade la sección `Related` sin tocar el resto del contenido
- Nuevo workflow n8n `enrich-links` que orquesta el pipeline completo: detectar fichero nuevo → mover a wiki → reindex → enrich-links → borrar fichero fuente → commit

## Capabilities

### New Capabilities

- `enrich-links-script`: Script CLI `enrich-links.ts` que dado uno o más paths de documentos wiki ejecuta `discoverNewLinks` y aplica `upsertSection("Related")` de forma no destructiva
- `enrich-links-workflow`: Workflow n8n que monitoriza `raw/to-enrich/**`, mueve el fichero a `wiki/<subcarpeta>/` (sobreescribiendo si existe), lanza reindex + enrich-links + commit, y borra solo el fichero fuente preservando los directorios

### Modified Capabilities

## Impact

- `tools/health-check.ts`: las funciones `discoverNewLinks`, `applyDiscoveredLinks`, `loadWikiDocs`, `analyzeWikiGraph` se extraen o se reexportan para ser consumidas por el nuevo script (o el script las reimplementa de forma reducida)
- `tools/reindex.ts`: se invoca como herramienta existente, sin cambios
- `tools/apply-update.ts`: se invoca como herramienta existente, sin cambios
- `tools/commit.ts`: se invoca como herramienta existente, sin cambios
- Workflows n8n: nuevo workflow, sin modificar los existentes
- No hay cambios de API ni breaking changes
