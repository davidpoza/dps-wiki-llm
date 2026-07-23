## Context

La pantalla de Settings ya tiene tres operaciones asíncronas SSE (Reindexar, Keywords, Health Check) que comparten el mismo patrón: un endpoint `GET` que devuelve `SseEmitter`, eventos con nombre `progress` / `done` / `error`, y en el frontend un `EventSource` envuelto en un `Observable`. El vault almacena las notas bajo `wiki/concepts`, `wiki/sources` y `wiki/topics`; los enlaces entre notas se representan como `[[slug]]` en la sección `## Related`. El `MarkdownService` existente ya parsea y escribe estas secciones.

## Goals / Non-Goals

**Goals:**
- Escanear todos los ficheros `*.md` bajo `wiki/` y extraer los enlaces `[[slug]]` de la sección `Related`.
- Verificar si el slug resuelve a un fichero existente en el vault (la ruta normalizada `<slug>.md` o cualquier fichero cuyo nombre base coincida).
- Emitir progreso SSE fichero a fichero para que el frontend muestre avance en tiempo real.
- Al terminar, el frontend muestra un modal con todos los broken links agrupados por fichero origen, con checkboxes para selección.
- Un segundo endpoint elimina las entradas seleccionadas de la sección Related de cada fichero usando `MarkdownService`.

**Non-Goals:**
- Validar URLs externas (`http://...`).
- Corregir automáticamente los enlaces (solo se borran, no se reemplazan).
- Deshacer la eliminación desde el propio modal (el historial de versiones del vault ya cubre esto).
- Escanear secciones distintas de `Related`.

## Decisions

### 1. Reutilizar el patrón SSE existente

El endpoint `GET /api/settings/broken-links/scan` devuelve `SseEmitter` igual que `/reindex`, `/keywords/generate` y `/health-check`. Los eventos serán:
- `progress`: `{ processed: number, total: number, file: string }` — un evento por fichero procesado.
- `result`: `{ brokenLinks: BrokenLinkEntry[] }` — enviado una sola vez al terminar, con todos los broken links encontrados.
- `done`: señal de cierre (sin payload o con `{}`) para que el frontend sepa que completó.
- `error`: `{ message: string }` en caso de excepción.

Alternativa descartada: devolver los broken links acumulados en cada evento `progress`. Se descarta porque en vaults grandes generaría payloads crecientes en cada tick.

### 2. Resolución de slugs

Un slug `[[foo]]` o `[[foo|alias]]` se considera "válido" si existe algún fichero en el vault cuyo nombre base (sin extensión) sea exactamente `foo` (comparación case-insensitive). La búsqueda se realiza sobre el índice de rutas cargado al inicio del escaneo (snapshot estático, no en tiempo real).

Alternativa descartada: buscar recursivamente el vault en cada comprobación. Demasiado costoso para vaults grandes.

### 3. Mutación mediante MarkdownService

El endpoint `DELETE /api/settings/broken-links` recibe un body `{ entries: [{file, link}] }` y, para cada fichero afectado, usa `MarkdownService.parse()` + reescritura de la sección `Related` eliminando las líneas que contengan el slug exacto. Se guarda directamente en disco con `Files.writeString`.

Alternativa descartada: endpoint individual por enlace. Generaría N requests desde el frontend; es más simple recibir la lista completa.

### 4. Modal en frontend como componente independiente

`BrokenLinksModalComponent` es un componente standalone que recibe los broken links como `@Input` y emite un evento `confirmed` con los seleccionados. Usa `DialogModule` y `CheckboxModule` de PrimeNG (ya disponibles). Se instancia dentro de `SettingsComponent` con `@if (showBrokenLinksModal())`.

## Risks / Trade-offs

- **[Riesgo] Vault muy grande** → El escaneo puede tardar varios segundos. Mitigación: el progreso SSE mantiene al usuario informado; el botón se deshabilita durante el escaneo.
- **[Riesgo] Fichero modificado entre escaneo y eliminación** → Si alguien edita un fichero entre el escaneo y la confirmación, la eliminación puede no encontrar la línea exacta. Mitigación: si la línea no existe en el momento del DELETE, se ignora silenciosamente (idempotente).
- **[Trade-off] Snapshot estático del vault** → El índice de rutas se carga una vez al inicio del escaneo. Los ficheros creados durante el escaneo no se consideran. Aceptable para este caso de uso.
