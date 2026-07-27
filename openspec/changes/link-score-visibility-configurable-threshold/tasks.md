## 1. Backend — Umbral configurable en LinkDiscoveryService

- [x] 1.1 Inyectar `AppSettingRepository` en `LinkDiscoveryService`
- [x] 1.2 Extraer método `readThreshold()` en `LinkDiscoveryService` que lee `link.similarity-threshold` de `app_settings` con fallback a 0.72 (igual al patrón de `ConceptResolutionService`)
- [x] 1.3 Sustituir la constante `DEFAULT_THRESHOLD` hardcodeada por la llamada a `readThreshold()` en el método `discover()`

## 2. Backend — Umbral configurable en ConnectionDiscoveryService

- [x] 2.1 Inyectar `AppSettingRepository` en `ConnectionDiscoveryService`
- [x] 2.2 Extraer método `readThreshold()` en `ConnectionDiscoveryService` que lee `link.connection-threshold` de `app_settings` con fallback a 0.72
- [x] 2.3 Sustituir `DEFAULT_THRESHOLD` y `TOPIC_CONNECTION_THRESHOLD` hardcodeados por llamadas a `readThreshold()`

## 3. Backend — Endpoint GET /links/score

- [x] 3.1 Crear método en `JdbcDocumentIndexRepository` (o `DocumentIndexRepository`) que calcula similitud coseno entre dos paths usando el operador `<=>` con limit 1
- [x] 3.2 Crear `LinkScoreController` (o añadir endpoint a `JobController`) con `GET /links/score?src=&tgt=` que devuelve `{ "score": Double | null }`
- [x] 3.3 Manejar el caso donde alguno de los documentos no tiene embedding (devolver `{ "score": null }`)

## 4. Backend — Endpoints GET/PUT /settings/link-threshold

- [x] 4.1 Añadir `GET /settings/link-threshold` en `SettingsController` que lee `link.similarity-threshold` de `app_settings` y devuelve `{ "threshold": 0.72 }` (con fallback)
- [x] 4.2 Añadir `PUT /settings/link-threshold` en `SettingsController` que valida rango [0.0, 1.0] y persiste el valor en `app_settings`

## 5. Frontend — Servicio API

- [x] 5.1 Añadir método `getLinkScore(src: string, tgt: string): Observable<{ score: number | null }>` en `api.service.ts`
- [x] 5.2 Añadir métodos `getLinkThreshold(): Observable<{ threshold: number }>` y `setLinkThreshold(threshold: number): Observable<void>` en `api.service.ts`

## 6. Frontend — Menú contextual "Ver puntuación de enlace"

- [x] 6.1 Añadir señal `wikilinkScoreResult` (string | null) en `explorer.component.ts` para mostrar el resultado en el menú
- [x] 6.2 Añadir la opción "Ver puntuación de enlace" en el template del menú contextual de wikilinks en `explorer.component.ts`
- [x] 6.3 Implementar método `openLinkScorePanel()` que resuelve el target a ruta completa, llama a `api.getLinkScore()` y actualiza `wikilinkScoreResult`
- [x] 6.4 Mostrar el resultado ("Similitud: 0.847", "Sin puntuación disponible" o "Error al obtener puntuación") en el menú contextual debajo de la opción, sin cerrar el menú

## 7. Frontend — Campo de umbral en Settings

- [x] 7.1 Añadir sección "Umbral de similitud de enlace" en la pestaña Datos de `settings.component.ts`, con campo numérico (min=0, max=1, step=0.01) y texto de ayuda
- [x] 7.2 Cargar el valor actual desde `api.getLinkThreshold()` al inicializar el componente Settings
- [x] 7.3 Guardar el valor al hacer clic en "Guardar" mediante `api.setLinkThreshold()` y mostrar confirmación
- [x] 7.4 Validar que el valor esté en rango [0.00, 1.00] y deshabilitar el botón "Guardar" si no es válido
