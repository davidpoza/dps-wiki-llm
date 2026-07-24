## Why

Los usuarios no tienen forma de saber si un documento tiene su embedding calculado ni cuándo fue generado por última vez, lo que dificulta saber si el contenido será recuperable en búsquedas semánticas. Añadir un indicador visual en el editor elimina esa ambigüedad sin interrumpir el flujo de trabajo.

## What Changes

- El encabezado del editor mostrará un icono de estado del embedding como prefijo al path del fichero.
- El icono diferenciará entre "embedding presente" y "sin embedding".
- Al hacer hover sobre el icono se mostrará la fecha de la última actualización del embedding (o un mensaje indicando que no existe).
- El backend expondrá un endpoint que devuelva el estado del embedding para un path de documento dado.

## Capabilities

### New Capabilities

- `embedding-status-indicator`: Indicador visual en el encabezado del editor que muestra si el documento tiene embedding calculado y cuándo fue actualizado por última vez, con tooltip en hover.

### Modified Capabilities

- `document-viewer-header`: El encabezado del documento añade el icono de estado del embedding como prefijo al path, integrándose con el diseño visual existente de ruta enfatizada.

## Impact

- **Backend**: nuevo endpoint `GET /api/documents/embedding-status?path=<relative-path>` que consulta la tabla de embeddings para devolver `{ hasEmbedding: boolean, lastUpdated: string | null }`.
- **Frontend**: componente `EmbeddingStatusIndicatorComponent` que se integra en el encabezado del editor (`document-viewer` o similar), llama al endpoint al abrir un documento, y muestra el icono con tooltip.
- **Sin cambios en el pipeline de embeddings ni en la tabla**: solo se consume información existente.
