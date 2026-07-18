## Why

Los tabs de la pantalla principal (`/`) no tienen URL propia: cambiar de tab no actualiza la barra de direcciones, por lo que no es posible compartir un enlace directo a un tab concreto ni navegar con el botón atrás entre ellos. Añadir rutas individuales por tab completa el modelo de navegación iniciado con `frontend-explorer-routing` y unifica el comportamiento de toda la aplicación.

## What Changes

- La ruta `/` redirige automáticamente a `/jobs` (tab por defecto).
- Se añaden rutas de nivel superior para cada tab: `/jobs`, `/ingest`, `/chat`, `/review`, `/git`.
- Al navegar entre tabs, la URL se actualiza y el botón atrás/adelante del navegador funciona.
- Al acceder directamente a `/chat` (o cualquier otro tab) se abre la pantalla principal con ese tab activo.
- El componente `HomeComponent` deja de gestionar el tab activo con una signal interna y lo lee de la URL.

## Capabilities

### New Capabilities

- `home-tab-routing`: Sincronización bidireccional entre el tab activo en HomeComponent y la URL. Incluye deep-link por tab, navegación con historial del navegador y redirección de `/` a `/jobs`.

### Modified Capabilities

<!-- Sin cambios en specs existentes. -->

## Impact

- `frontend/src/main.ts`: reemplazar la ruta `{ path: '' }` por rutas individuales por tab y una redirección desde `/`.
- `frontend/src/app/components/home.component.ts`: leer el tab activo de `ActivatedRoute` y navegar al cambiar de tab.
- Sin cambios en backend, APIs ni dependencias externas.
