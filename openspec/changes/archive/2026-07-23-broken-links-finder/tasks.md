## 1. Backend — DTOs y estructura

- [x] 1.1 Crear record `BrokenLinkEntry(String sourceFile, String link, String displayAlias)` en `com.dpswikillm.dto`
- [x] 1.2 Crear record `BrokenLinkScanProgress(int processed, int total, String file)` en `com.dpswikillm.dto`
- [x] 1.3 Crear record `BrokenLinkScanResult(List<BrokenLinkEntry> brokenLinks)` en `com.dpswikillm.dto`
- [x] 1.4 Crear record `BrokenLinkDeleteRequest(List<BrokenLinkDeleteEntry> entries)` y `BrokenLinkDeleteEntry(String sourceFile, String link)` en `com.dpswikillm.dto`
- [x] 1.5 Crear record `BrokenLinkDeleteResult(int deleted)` en `com.dpswikillm.dto`

## 2. Backend — Servicio de escaneo

- [x] 2.1 Crear `BrokenLinkScanService` en `com.dpswikillm.services`
- [x] 2.2 Implementar carga del índice de rutas del vault (snapshot de todos los `*.md` bajo `wiki/`) al inicio del escaneo
- [x] 2.3 Implementar extracción de slugs de la sección `Related` usando `MarkdownService.parse()`, soportando `[[slug]]` y `[[slug|alias]]`
- [x] 2.4 Implementar verificación de slug: comparar contra nombre base de fichero (sin extensión, case-insensitive) y contra ruta relativa sin extensión
- [x] 2.5 Implementar método `scan(Consumer<BrokenLinkScanProgress> progressCallback)` que itera ficheros emitiendo progreso y devuelve `BrokenLinkScanResult`

## 3. Backend — Servicio de eliminación

- [x] 3.1 Implementar en `BrokenLinkScanService` (o servicio propio) el método `deleteLinks(List<BrokenLinkDeleteEntry> entries)` que devuelve `int` con el número de entradas borradas
- [x] 3.2 Para cada fichero afectado: parsear sección `Related` con `MarkdownService`, eliminar las líneas que contengan el slug exacto, reescribir el fichero con `Files.writeString`
- [x] 3.3 Manejar el caso idempotente: si la línea no existe, ignorarla sin lanzar excepción

## 4. Backend — Controller

- [x] 4.1 Añadir `BrokenLinkScanService` al constructor de `SettingsController`
- [x] 4.2 Añadir endpoint SSE `GET /settings/broken-links/scan` siguiendo el patrón de `reindex()`: `SseEmitter`, `CompletableFuture.runAsync`, eventos `progress`, `result`, `done`, `error`
- [x] 4.3 Añadir endpoint `DELETE /settings/broken-links` que recibe `BrokenLinkDeleteRequest` y devuelve `BrokenLinkDeleteResult`

## 5. Frontend — Tipos y ApiService

- [x] 5.1 Añadir interfaces `BrokenLinkEntry`, `BrokenLinkScanProgress`, `BrokenLinkScanResult` en `api.service.ts`
- [x] 5.2 Añadir método `scanBrokenLinks(): Observable<BrokenLinkScanProgress | BrokenLinkScanResult>` en `ApiService` usando el patrón `EventSource` existente, diferenciando eventos `progress` y `result`
- [x] 5.3 Añadir método `deleteBrokenLinks(entries: {sourceFile: string, link: string}[]): Observable<{deleted: number}>` en `ApiService`

## 6. Frontend — Modal component

- [x] 6.1 Crear componente standalone `BrokenLinksModalComponent` en `frontend/src/app/components/`
- [x] 6.2 Agrupar los broken links por `sourceFile` para mostrarlos en secciones con el nombre del fichero como encabezado
- [x] 6.3 Implementar checkboxes con PrimeNG `CheckboxModule`, todos marcados por defecto
- [x] 6.4 Botón "Eliminar seleccionados" deshabilitado si no hay ningún checkbox marcado
- [x] 6.5 Botón "Cancelar" que cierra el modal sin hacer nada
- [x] 6.6 Al confirmar: emitir evento `confirmed` con la lista de entradas seleccionadas (sin diálogo nativo, el propio botón actúa como confirmación — el texto del botón incluirá el conteo, ej. "Eliminar 3 enlaces")

## 7. Frontend — Settings integration

- [x] 7.1 Añadir señales en `SettingsComponent`: `brokenLinkScanning`, `blProcessed`, `blTotal`, `blDone`, `blError`, `brokenLinks`, `showBrokenLinksModal`, `blDeleted`
- [x] 7.2 Añadir sección "Enlaces rotos" en el template de `SettingsComponent` con botón, progreso inline y mensaje de resultado
- [x] 7.3 Instanciar `BrokenLinksModalComponent` con `@if (showBrokenLinksModal())`, pasando `brokenLinks` como input
- [x] 7.4 Implementar `startBrokenLinksScan()` que suscribe al Observable SSE, actualiza las señales de progreso y al recibir el evento `result` abre el modal
- [x] 7.5 Implementar `onBrokenLinksConfirmed(entries)` que llama a `api.deleteBrokenLinks()`, cierra el modal y muestra el mensaje de éxito
- [x] 7.6 Añadir `BrokenLinksModalComponent` a los `imports` del `SettingsComponent`

## 8. Verificación E2E

- [x] 8.1 Arrancar el backend y navegar a Settings; verificar que aparece la nueva sección "Enlaces rotos"
- [x] 8.2 Lanzar el escaneo y comprobar que el progreso se actualiza en tiempo real
- [x] 8.3 Al terminar, verificar que el modal se abre con la lista de broken links y los checkboxes marcados
- [x] 8.4 Desmarcar algún enlace, hacer clic en "Eliminar" y verificar que solo se eliminan los marcados
- [x] 8.5 Relanzar el escaneo y comprobar que los enlaces eliminados ya no aparecen
- [x] 8.6 Verificar que si no hay broken links aparece el mensaje inline "No se encontraron enlaces rotos"
