## Context

El sistema actual dispone de un menú contextual sobre wikilinks con una única opción ("Explicar enlace"). La similitud coseno se calcula en el backend mediante el operador PostgreSQL `<=>` sobre embeddings vectoriales. El umbral de corte para `LinkDiscoveryService` (0.72) está hardcodeado. `ConceptResolutionService` ya sigue el patrón correcto: lee su umbral desde `app_settings` con fallback. Debemos replicar ese patrón para el descubrimiento de enlaces.

Los wikilinks en el editor son texto plano (`[[target]]`); no almacenan puntuación. Para mostrar el score en el menú contextual hay que calcularlo bajo demanda en el backend dado (src, target).

## Goals / Non-Goals

**Goals:**
- Añadir opción "Ver puntuación de enlace" al menú contextual de wikilinks, con llamada backend bajo demanda
- Backend: nuevo endpoint `GET /links/score?src=&tgt=` que devuelve el score de similitud coseno
- `LinkDiscoveryService` lee `link.similarity-threshold` de `app_settings` con fallback a 0.72
- `ConnectionDiscoveryService` lee `link.connection-threshold` de `app_settings` con fallback a 0.72
- Settings screen: campo numérico (0.0–1.0, step 0.01) para `link.similarity-threshold` en pestaña Datos
- `SettingsController`: nuevos endpoints GET/PUT para `link.similarity-threshold`

**Non-Goals:**
- No cambiar la representación de scores en links existentes ni en el modal de link discovery
- No exponer `link.connection-threshold` en la UI (es un parámetro interno del job de conexiones)
- No modificar `ConceptResolutionService` (ya usa el patrón correcto)

## Decisions

**D1: Score bajo demanda vs. precomputado**
El score se calcula en el backend cuando el usuario abre el menú y pulsa la opción, no al renderizar el editor. Razón: los wikilinks son texto plano; precomputar requeriría indexar todos los pares enlace-documento, lo que es costoso y no es necesario para un caso de uso ocasional.

**D2: Reutilizar `JdbcDocumentIndexRepository.findSimilar()` para el score**
El endpoint `GET /links/score` recupera el embedding del documento destino y calcula la similitud contra el documento fuente usando la misma query ya existente, filtrando por path exacto. Alternativa descartada: añadir una query SQL nueva específica — innecesario cuando `findSimilar` con limit=1 ya devuelve el score.

**D3: Separar `link.similarity-threshold` (link discovery UI) de `link.connection-threshold` (job interno)**
Solo `link.similarity-threshold` se expone en Settings. El umbral del job de conexiones es operacional y no conviene que usuarios lo cambien sin entender el impacto en el volumen de propuestas generadas. Quedará configurable vía `app_settings` pero sin UI por ahora.

**D4: Patrón `readThreshold()` idéntico al de `ConceptResolutionService`**
Inyectar `AppSettingRepository` en `LinkDiscoveryService` y `ConnectionDiscoveryService` y leer el setting en cada invocación (no en el constructor), para que cambios en Settings surtan efecto sin reiniciar.

**D5: Mostrar score en el menú contextual como tooltip/línea de texto, no modal**
La opción "Ver puntuación" muestra el valor directamente en el menú (p.ej. "Similitud: 0.847") o en un small popover, sin abrir un modal completo. Simplifica la UX para una información puntual.

## Risks / Trade-offs

- [Performance] Cada click en "Ver puntuación" hace una llamada HTTP → Mitigation: el resultado es inmediato (query vectorial con limit=1); aceptable para uso interactivo.
- [Stale cache] Si el embedding de un documento cambia tras reindexar, el score mostrado puede diferir del usado en el último job → Mitigation: el score siempre se calcula en tiempo real, reflejando el estado actual de los embeddings.
- [Threshold change impact] Bajar el umbral desde Settings generará más sugerencias de enlaces → Mitigation: documentar en el campo Settings el efecto esperado (más ruido vs. más cobertura).
