## 1. Infraestructura base

- [x] 1.1 Crear los directorios `enrich/concepts/`, `enrich/topics/`, `enrich/entities/`, `enrich/analyses/` con `.gitkeep` para que persistan en el repositorio

## 2. Script enrich-links.ts

- [x] 2.1 Crear `tools/enrich-links.ts` con entrada CLI `--vault <path> [--paths <path> ...]` siguiendo el patrón de herramientas existente (parseArgs, writeJsonStdout, createLogger)
- [x] 2.2 Implementar carga de wiki docs y grafo: invocar `loadWikiDocs` y `analyzeWikiGraph` desde `lib/wiki-inspect.ts`
- [x] 2.3 Implementar selección de documentos target: si `--paths` está presente filtrar por esos paths, si no usar todos los docs de tipo conocido
- [x] 2.4 Implementar búsqueda de candidatos: para cada doc target invocar `searchFn(doc.title, 5)` (hybrid-search si existe índice semántico, search si no), filtrar el propio doc y ya-enlazados, tomar top 3
- [x] 2.5 Construir `MutationPlan` con `related_links` para cada doc que tenga candidatos y ejecutar `runToolJson("apply-update", plan)`
- [x] 2.6 Emitir resultado JSON con paths actualizados, skipped y errores
- [x] 2.7 Añadir `"enrich-links": "node dist/tools/enrich-links.js"` en `scripts` de `package.json`
- [x] 2.8 Compilar y verificar que `node dist/tools/enrich-links.js --vault . --paths wiki/concepts/alguna-nota.md` funciona correctamente

## 3. Workflow n8n kb-enrich-links

- [x] 3.1 Crear `n8n/workflows/kb-enrich-links.json` con nodo `localFileTrigger` apuntando a `/data/vault/enrich/` con evento `add`, ignorando `.gitkeep`
- [x] 3.2 Añadir nodo `Code` "Resolve Destination" que extrae la subcarpeta origen y construye el path destino en `wiki/<tipo>/`, fallando con error explícito si la subcarpeta no es reconocida
- [x] 3.3 Añadir nodo `Execute Command` "Copy to Wiki" que copia el fichero al destino (`cp <src> <dest>`, creando el directorio si no existe)
- [x] 3.4 Añadir nodo `Execute Command` "Run reindex" que ejecuta `node /app/dist/tools/reindex.js --vault /data/vault`
- [x] 3.5 Añadir nodo `Code` "Parse Reindex Result" que parsea el JSON de stdout y falla si está vacío
- [x] 3.6 Añadir nodo `Execute Command` "Run enrich-links" que ejecuta `node /app/dist/tools/enrich-links.js --vault /data/vault --paths <wiki-dest-path>`
- [x] 3.7 Añadir nodo `Code` "Parse Enrich Result" que parsea el JSON de stdout
- [x] 3.8 Añadir nodo `Execute Command` "Run commit" que ejecuta `node /app/dist/tools/commit.js --vault /data/vault` con input del paso anterior
- [x] 3.9 Añadir nodo `Execute Command` "Delete Source File" que elimina únicamente el fichero fuente (`rm <enrich/tipo/fichero.md>`), solo si todos los pasos anteriores han tenido éxito
- [x] 3.10 Conectar rama de error: si cualquier paso falla, el fichero fuente NO se borra (dejar que n8n propague el error sin ejecutar el paso 3.9)
- [ ] 3.11 Importar y activar el workflow en la instancia n8n
