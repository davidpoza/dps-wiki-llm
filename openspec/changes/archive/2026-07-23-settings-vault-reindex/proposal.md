## Why

El índice de documentos del vault puede quedar desincronizado (tras ediciones manuales de ficheros, restauraciones de git, etc.) y no existe ningún mecanismo en la UI para regenerarlo. El usuario necesita poder relanzar la indexación completa desde la pantalla de ajustes y ver el progreso en tiempo real.

## What Changes

- Nueva sección "Índice del Vault" en la pantalla de Settings, con un botón "Reindexar" y un indicador de progreso en tiempo real ("Ficheros procesados x/y").
- Nuevo endpoint backend `POST /settings/reindex` que lanza la reindexación de forma asíncrona y emite eventos SSE de progreso con `processed` y `total`.
- El frontend se suscribe al stream SSE existente (`/jobs/events`) o a un stream propio del endpoint para recibir actualizaciones de progreso hasta completar o fallar.

## Capabilities

### New Capabilities

- `vault-reindex`: Permite al usuario relanzar la indexación completa del vault desde Settings, con progreso en tiempo real vía SSE.

### Modified Capabilities

_(ninguna)_

## Impact

- **Backend**: nuevo endpoint `POST /settings/reindex` en un `SettingsController` o en `PromptController`; modificación de `ReindexService` para emitir eventos de progreso incrementales.
- **Frontend**: `settings.component.ts` añade nueva sección con señales de estado (`reindexing`, `processed`, `total`, `error`); `api.service.ts` añade método `reindex()` que abre un `EventSource`.
- **Sin breaking changes**: la lógica de indexación existente no cambia, solo se expone su progreso.
