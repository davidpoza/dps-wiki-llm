## ADDED Requirements

### Requirement: Endpoint de estado del embedding por documento

El backend SHALL exponer `GET /api/documents/embedding-status?path=<relative-path>` que consulte la tabla `documents` por el path exacto del documento y devuelva si existe un embedding calculado y cuándo fue generado por última vez.

La respuesta SHALL seguir el esquema:
```json
{ "hasEmbedding": boolean, "lastUpdated": string | null }
```
donde `lastUpdated` es un timestamp ISO 8601 UTC cuando `hasEmbedding` es `true`, y `null` en caso contrario.

#### Scenario: Documento con embedding

- **WHEN** el cliente llama a `GET /api/documents/embedding-status?path=wiki/concepts/foo.md`
- **THEN** el backend responde HTTP 200 con `{ "hasEmbedding": true, "lastUpdated": "<timestamp ISO 8601>" }`

#### Scenario: Documento sin embedding

- **WHEN** el cliente llama a `GET /api/documents/embedding-status?path=wiki/new/bar.md` y ese documento no tiene fila en `documents` o tiene `embedded_at = null`
- **THEN** el backend responde HTTP 200 con `{ "hasEmbedding": false, "lastUpdated": null }`

#### Scenario: Path fuera del vault

- **WHEN** el cliente llama al endpoint con un path que resuelve fuera del vault o contiene traversal (`../`)
- **THEN** el backend responde HTTP 400 Bad Request

### Requirement: Indicador visual del embedding en el encabezado del editor

El frontend SHALL mostrar un icono de estado del embedding como prefijo al path del fichero en el encabezado del editor, visible únicamente cuando hay un documento abierto.

El icono SHALL diferenciarse visualmente entre el estado "con embedding" y "sin embedding" (p.ej. color distinto o icono distinto).

Al hacer hover sobre el icono, un tooltip SHALL mostrar:
- La fecha de última actualización del embedding en formato legible cuando `hasEmbedding` es `true`.
- Un mensaje indicando la ausencia de embedding cuando `hasEmbedding` es `false`.

#### Scenario: Documento con embedding al abrir

- **WHEN** el usuario abre un documento y el backend responde `{ "hasEmbedding": true, "lastUpdated": "..." }`
- **THEN** el encabezado muestra el icono en estado "con embedding" con el tooltip que incluye la fecha

#### Scenario: Documento sin embedding al abrir

- **WHEN** el usuario abre un documento y el backend responde `{ "hasEmbedding": false, "lastUpdated": null }`
- **THEN** el encabezado muestra el icono en estado "sin embedding" con un tooltip indicándolo

#### Scenario: Error al consultar el estado

- **WHEN** la llamada al endpoint falla (timeout, error de red, 5xx)
- **THEN** el icono no se muestra y el encabezado permanece inalterado (degradación silenciosa)

#### Scenario: Actualización al cambiar de documento

- **WHEN** el usuario selecciona un fichero diferente en el árbol
- **THEN** el indicador se resetea y se recarga con el estado del nuevo documento
