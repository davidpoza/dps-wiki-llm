## ADDED Requirements

### Requirement: Opción "Ver puntuación" en el menú contextual de wikilink

El menú contextual de wikilinks SHALL incluir una opción "Ver puntuación de enlace" junto a "Explicar enlace". Al seleccionarla, el frontend SHALL llamar al backend con la ruta del documento activo (src) y la ruta resuelta del wikilink (tgt) y mostrar la similitud coseno devuelta directamente en el menú como texto informativo (p.ej. "Similitud: 0.847"). Si el documento destino no tiene embedding, SHALL mostrarse "Sin puntuación disponible".

#### Scenario: Puntuación mostrada al seleccionar la opción

- **WHEN** el usuario hace clic derecho sobre un wikilink y selecciona "Ver puntuación de enlace"
- **THEN** el frontend llama a `GET /links/score?src={srcPath}&tgt={tgtPath}`
- **THEN** el menú muestra "Similitud: {score}" con el valor redondeado a 3 decimales

#### Scenario: Documento destino sin embedding

- **WHEN** el backend no encuentra embedding para el documento destino
- **THEN** el menú muestra "Sin puntuación disponible"

#### Scenario: Error de red al obtener puntuación

- **WHEN** la llamada al backend falla por error de red o 5xx
- **THEN** el menú muestra "Error al obtener puntuación"

### Requirement: Endpoint backend GET /links/score

El backend SHALL exponer `GET /links/score?src={path}&tgt={path}` que devuelve un objeto JSON `{ "score": 0.847 }` con la similitud coseno entre los embeddings de los dos documentos. Si alguno de los documentos no tiene embedding, SHALL devolver `{ "score": null }`.

#### Scenario: Ambos documentos tienen embedding

- **WHEN** se llama a `GET /links/score?src=wiki/a.md&tgt=wiki/b.md`
- **AND** ambos documentos tienen embeddings en la base de datos
- **THEN** la respuesta es `200 { "score": <valor entre 0 y 1> }`

#### Scenario: Documento sin embedding

- **WHEN** se llama a `GET /links/score` y el documento destino no tiene embedding
- **THEN** la respuesta es `200 { "score": null }`
