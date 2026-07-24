## 1. Backend — HealthCheckService

- [x] 1.1 Añadir método `run(List<String> paths, Consumer<HealthCheckProgress> onProgress)` en `HealthCheckService` que, en la fase 2, filtra los documentos a procesar a los que aparecen en la lista `paths`
- [x] 1.2 Extraer la lógica de filtrado de documentos en `discoverConnections` para que acepte un `Set<String>` de paths permitidos (vacío = todos)
- [x] 1.3 Verificar que la fase 1 (reindex + embedIncremental) permanece sin cambios y se ejecuta sobre todo el vault

## 2. Backend — Endpoint parcial

- [x] 2.1 Añadir endpoint `GET /settings/health-check/partial` en `SettingsController` que acepta `@RequestParam List<String> paths` y devuelve `SseEmitter`
- [x] 2.2 Validar que la lista `paths` no esté vacía y devolver 400 si lo está
- [x] 2.3 Delegar la ejecución al nuevo método `HealthCheckService.run(paths, onProgress)` siguiendo el mismo patrón SSE del endpoint existente
- [x] 2.4 Añadir la ruta `/settings/health-check/partial` a `SecurityConfig` si es necesario (seguir el patrón de `/settings/health-check`)

## 3. Frontend — Servicio API

- [x] 3.1 Añadir método `runHealthCheckPartial(paths: string[]): Observable<HealthCheckProgress>` en `ApiService` que construye la URL `GET /api/settings/health-check/partial?paths=...` con múltiples parámetros y abre un `EventSource` SSE

## 4. Frontend — Componente modal

- [x] 4.1 Crear `HealthCheckSelectionModalComponent` en `frontend/src/app/components/health-check-selection-modal.component.ts`
- [x] 4.2 Implementar las fases del modal: `loading` → `ready` → `running` → `done` | `error`
- [x] 4.3 En la fase `loading`: llamar a `api.listNotes(['wiki/concepts', 'wiki/sources'])` y mostrar spinner
- [x] 4.4 En la fase `ready`: mostrar la lista de notas con checkboxes, campo de búsqueda, botones "Seleccionar todo" / "Deseleccionar todo", agrupadas por carpeta (replicar lógica de `KeywordSelectionModalComponent`)
- [x] 4.5 Deshabilitar el botón de confirmación cuando `selectedCount() === 0`
- [x] 4.6 En la fase `running`: suscribirse a `api.runHealthCheckPartial(selectedPaths)` y mostrar progreso (phase, processed/total, porcentaje, embeddings, conexiones) — mismos textos que el health-check completo en settings
- [x] 4.7 En la fase `done`: mostrar resumen (embeddings construidos, conexiones encontradas) y botón Cerrar
- [x] 4.8 En la fase `error`: mostrar mensaje de error y botón Cerrar
- [x] 4.9 Aplicar estilos coherentes con `KeywordSelectionModalComponent` (modal-body, toolbar-row, notes-list, folder-group, etc.)

## 5. Frontend — Integración en Settings

- [x] 5.1 Importar `HealthCheckSelectionModalComponent` en `settings.component.ts` y añadirlo al array `imports`
- [x] 5.2 Añadir signal `showHealthCheckModal = signal(false)` en `settings.component.ts`
- [x] 5.3 Añadir el botón "Seleccionar notas…" junto al botón "Lanzar Health Check" existente en el template (tamaño `small`, severity `secondary`)
- [x] 5.4 Renderizar `<app-health-check-selection-modal>` condicionalmente cuando `showHealthCheckModal()` sea true, con `(cancel)="showHealthCheckModal.set(false)"`

## 6. Verificación

- [x] 6.1 Verificar que el endpoint completo `GET /api/settings/health-check` sigue funcionando sin cambios
- [x] 6.2 Verificar que el endpoint parcial responde 400 cuando se llama sin `paths`
- [ ] 6.3 Verificar que el modal de selección carga las notas, permite buscar, seleccionar/deseleccionar y muestra progreso SSE
- [ ] 6.4 Verificar que al completar el Health Check parcial se muestran los resultados en el modal
- [ ] 6.5 Verificar que el botón "Seleccionar notas…" y el botón "Lanzar Health Check" coexisten correctamente en la sección
