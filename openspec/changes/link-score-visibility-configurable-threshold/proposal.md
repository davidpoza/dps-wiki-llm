## Why

Al hacer clic derecho sobre un enlace wiki, el usuario no tiene forma de saber qué tan fuerte es la relación semántica que motivó ese enlace. Además, el umbral de similitud coseno que controla qué enlaces se descubren está hardcodeado en el backend, impidiendo ajustarlo sin recompilar.

## What Changes

- Se añade la opción **"Ver puntuación de enlace"** al menú contextual de wikilinks, que muestra la similitud coseno del enlace con el documento actual.
- El umbral de corte para descubrimiento de enlaces (`LinkDiscoveryService`, actualmente 0.72 hardcodeado) pasa a ser configurable desde la pantalla Settings (key `link.similarity-threshold` en `app_settings`).
- Se expone la score del enlace en la API de exploración/viewer para que el frontend pueda mostrarla.

## Capabilities

### New Capabilities

- `link-score-panel`: Opción en el menú contextual de wikilinks que muestra la puntuación de similitud coseno del enlace seleccionado respecto al documento activo.
- `link-similarity-threshold-setting`: Configuración en la pantalla Settings que permite al usuario ajustar el umbral mínimo de similitud coseno para el descubrimiento de enlaces (por defecto 0.72), persistido en `app_settings`.

### Modified Capabilities

- `link-explain-context-menu`: Se añade la nueva opción "Ver puntuación" al menú contextual existente, junto a "Explicar enlace".
- `link-discovery-add-to-related`: El servicio de descubrimiento ahora lee el umbral desde `app_settings` en lugar de usarlo hardcodeado.

## Impact

- **Backend**: `LinkDiscoveryService.java` — leer `link.similarity-threshold` de `AppSettingRepository` con fallback a 0.72. `ConnectionDiscoveryService.java` — idem para el umbral de 0.72.
- **Backend**: Endpoint de link discovery debe incluir el campo `score` en la respuesta (ya existe en `DiscoveredLink`).
- **Backend**: `SettingsController.java` — nuevo endpoint GET/PUT para `link.similarity-threshold`.
- **Frontend**: `explorer.component.ts` — añadir opción al menú contextual y lógica para obtener/mostrar score.
- **Frontend**: `settings.component.ts` — nuevo campo numérico en la pestaña Datos para configurar el umbral.
- **Frontend**: `api.service.ts` — nuevo método para leer/escribir `link.similarity-threshold`.
- Sin cambios en el esquema de base de datos (usa la tabla `app_settings` existente).
