## 1. Esquema e indexado del frontmatter (backend)

- [x] 1.1 Crear migración `V41__documents_frontmatter.sql`: `ALTER TABLE documents ADD COLUMN frontmatter JSONB NOT NULL DEFAULT '{}'`, `CREATE EXTENSION IF NOT EXISTS unaccent` (si no está ya en `V1__extensions.sql`), e índice `CREATE INDEX idx_documents_frontmatter ON documents USING gin (frontmatter)`.
- [x] 1.2 Añadir `Map<String,Object> frontmatter` (o su JSON serializado) al record `DocumentRecord`.
- [x] 1.3 En `WikiDocumentReader.read`, propagar `markdown.frontmatter()` al `DocumentRecord` construido.
- [x] 1.4 En `JdbcDocumentIndexRepository.replaceDocuments` y `upsertDocument`, serializar el frontmatter a JSON (Jackson) e insertarlo con cast `?::jsonb` en la columna `frontmatter`.
- [x] 1.5 Ampliar el `RowMapper` de lectura de documentos para incluir `frontmatter` donde sea necesario (mantener retrocompatibilidad del resto de consumidores).

## 2. Filtrado en el lookup (backend)

- [x] 2.1 Definir un tipo de filtro `FrontmatterFilter(String key, String value)` y su parseo desde el parámetro `fm` (split en el primer `:`).
- [x] 2.2 Ampliar `FileLookupService.lookup` para aceptar `List<FrontmatterFilter>` y delegar en el repositorio; si la lista está vacía y hay texto, comportamiento actual intacto.
- [x] 2.3 Ampliar `JdbcDocumentIndexRepository.lexicalLookup` (o añadir método nuevo) para construir dinámicamente los predicados de frontmatter: por cada filtro, `EXISTS` sobre `jsonb_each` con resolución de clave case-insensitive y comparación `unaccent(lower(valor)) LIKE unaccent(lower('%v%'))` cubriendo valor escalar y elementos de lista (`jsonb_array_elements_text`).
- [x] 2.4 Implementar la semántica "solo filtros": si no hay texto libre, omitir el `WHERE title/path/body ILIKE` y ordenar por `updated_at DESC`; con texto, conservar el scoring por `similarity` y añadir los filtros como `AND`.
- [x] 2.5 Actualizar el endpoint `GET /api/files/lookup` en `JobController` para aceptar `@RequestParam(value="fm", required=false) List<String> fm` y propagarlo al servicio.

## 3. Buscador (frontend)

- [x] 3.1 Añadir en el componente una función de parseo que extraiga tokens `[clave: valor]` (regex `\[\s*([^:\]]+?)\s*:\s*([^\]]*?)\s*\]`) y devuelva `{ text, filters }`.
- [x] 3.2 Modificar `ApiService.lookupFiles` para aceptar los filtros y enviarlos como params `fm=clave:valor` repetidos.
- [x] 3.3 Ajustar el pipeline de búsqueda (`queries`/`switchMap`) para disparar la petición cuando haya texto **o** filtros (permitir "solo filtros"), manteniendo debounce y `distinctUntilChanged` sobre el input completo.
- [x] 3.4 Renderizar chips de solo lectura con los filtros activos (`clave: valor`) por encima de los resultados; conservar el mensaje de "sin resultados" existente.
- [x] 3.5 Añadir las claves de traducción Transloco necesarias (placeholder/ayuda de sintaxis, etiqueta de filtros) en los ficheros de idiomas.

## 4. Verificación

- [x] 4.1 `mvn compile` y reinicio del proceso backend (perfil local, puerto 8090; sin DevTools). Migración V41 aplicada al arrancar.
- [x] 4.2 Ejecutar el reindexado completo del vault para poblar `frontmatter` en las 525 notas (477/525 con frontmatter no vacío).
- [x] 4.3 Verificado vía API (admin/admin): `q` solo texto (retrocompatible), texto + `fm=type:source` (AND), solo `fm=type:topic`, parcial `fm=type:sou`, lista `fm=keywords:probiotics`, clave case-insensitive `fm=tags:prod` sobre `Tags`, dos filtros AND, y sin coincidencia. Todos correctos.
- [x] 4.4 Verificado en el modal (navegador :4200): `[type: topic]` solo-filtros (8 topics, chip `type: topic`) y `productividad [type: source]` (texto+filtro AND, chip `type: source`, 3 sources). El input separa texto de filtros y los chips se renderizan bajo la etiqueta "Filters:".
- [x] 4.5 Test de semántica de filtrado por frontmatter añadido en `SemanticRetrievalServicesTests` (escalar, lista, case-insensitive, parcial, clave case-insensitive, texto+filtro AND, sin match). Nota: el test del parseo de tokens del frontend queda pendiente porque el repo no tiene runner de tests de frontend configurado (0 specs, sin karma/jasmine/vitest); introducir esa infraestructura es fuera de alcance de este cambio. El parseo se valida manualmente en 4.4.
