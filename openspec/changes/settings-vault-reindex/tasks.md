## 1. Backend — ReindexService con progreso incremental

- [x] 1.1 Crear record `ReindexProgress(int processed, int total)` en el paquete `domain` o `dto`
- [x] 1.2 Refactorizar `ReindexService.reindexWiki()` para contar primero el total de ficheros `.md`, luego procesar uno a uno invocando un `Consumer<ReindexProgress>` tras cada fichero, y realizar `replaceDocuments` al final con todos los documentos acumulados
- [x] 1.3 Verificar que el caso "vault no existe" emite `progress {processed:0, total:0}` y llama igualmente al consumer con el estado final

## 2. Backend — Endpoint SSE de reindexación

- [x] 2.1 Crear `SettingsController` con `POST /settings/reindex` que devuelve `SseEmitter` (timeout 0)
- [x] 2.2 Ejecutar `ReindexService.reindexWiki()` en hilo `@Async` (o `CompletableFuture`) pasando un consumer que haga `emitter.send(event().name("progress").data(progress))`
- [x] 2.3 Al terminar enviar evento `done` con el total procesado y llamar `emitter.complete()`
- [x] 2.4 En caso de excepción, enviar evento `error` con el mensaje y llamar `emitter.completeWithError(ex)` o `emitter.complete()` tras enviar el evento
- [x] 2.5 Asegurarse de que el endpoint está protegido por la seguridad existente (mismo rol que `PromptController`)

## 3. Frontend — ApiService

- [x] 3.1 Añadir interfaz `ReindexProgress { processed: number; total: number }` en `api.service.ts`
- [x] 3.2 Añadir método `reindex(): Observable<ReindexProgress>` en `ApiService` que crea un `EventSource` hacia `/api/settings/reindex` y emite los eventos `progress` y `done` como `ReindexProgress`, y completa o lanza error en `error`

## 4. Frontend — Settings UI

- [x] 4.1 Añadir señales `reindexing = signal(false)`, `reindexProcessed = signal(0)`, `reindexTotal = signal(0)`, `reindexDone = signal(false)`, `reindexError = signal<string|null>(null)` en `SettingsComponent`
- [x] 4.2 Añadir método `startReindex()` que llama a `api.reindex()`, actualiza las señales en cada evento, marca `reindexDone` al completar y `reindexError` en error, y al finalizar (sea éxito o error) vuelve a poner `reindexing` a `false`
- [x] 4.3 Añadir sección "Índice del Vault" en el template de `SettingsComponent` con: descripción, botón "Reindexar" (deshabilitado mientras `reindexing()`), y área de progreso condicional con "Ficheros procesados X/Y", mensaje de éxito y mensaje de error
- [x] 4.4 Auto-dismiss del mensaje de éxito tras 5 segundos con `setTimeout` que pone `reindexDone` a `false`
- [x] 4.5 Aplicar estilos coherentes con la sección existente de prompts (`.settings-section`, tarjeta con borde, separación visual)

## 5. Verificación

- [ ] 5.1 Arrancar backend y comprobar que `GET /api/settings/reindex` devuelve stream SSE con eventos `progress` y `done`
- [ ] 5.2 Arrancar frontend y verificar que el botón "Reindexar" actualiza el contador en tiempo real hasta completar
- [ ] 5.3 Verificar que el botón vuelve a activarse y muestra el mensaje de éxito al terminar
- [ ] 5.4 Verificar que el mensaje de éxito desaparece a los 5 segundos
