## Why

El atajo `Ctrl+P` para abrir el modal de búsqueda de archivos solo está disponible en la ruta `/explorer`, porque el `@HostListener` que lo registra vive en `ExplorerComponent`. En el resto de pantallas (jobs, ingest, chat, review, git, settings, profile) el shortcut no hace nada, lo que obliga al usuario a navegar primero al editor para poder buscar un archivo.

## What Changes

- Se extrae la lógica del modal de búsqueda de archivos de `ExplorerComponent` a un servicio global (`GlobalSearchService`) y un componente standalone ligero (`GlobalSearchModalComponent`).
- El modal se monta en `AppComponent`, fuera del router outlet, de forma que siempre está disponible independientemente de la ruta activa.
- El `@HostListener('document:keydown.control.p')` se mueve al `AppComponent` (o al nuevo componente modal) para que el shortcut sea global.
- `ExplorerComponent` consume el mismo servicio para abrir el modal y reaccionar a la selección de un archivo; cuando está activo, gestiona el caso de cambios sin guardar antes de navegar.
- Desde cualquier otra pantalla, seleccionar un archivo navega directamente a `/explorer/<path>`.

## Capabilities

### New Capabilities

- `global-search-modal`: Modal de búsqueda de archivos accesible desde cualquier ruta de la app mediante `Ctrl+P`, con navegación al archivo seleccionado.

### Modified Capabilities

<!-- No existing specs change requirements -->

## Impact

- **`AppComponent`** (`app.component.ts`): añade el componente del modal y el `HostListener` para `Ctrl+P`.
- **`ExplorerComponent`** (`explorer.component.ts`): delega apertura del modal al servicio global; suscribe al resultado para manejar cambios sin guardar.
- **Nuevo `GlobalSearchService`**: expone señales `open()` y `fileSelected$` para coordinar apertura y selección entre componentes.
- **Nuevo `GlobalSearchModalComponent`**: contiene el template del modal (p-dialog, input, lista de resultados) actualmente en `explorer.component.ts`.
- **`FileService`**: sin cambios, sigue siendo la fuente de datos del árbol de ficheros.
- **i18n** (`es.json`, `en.json`): reutiliza claves existentes de `explorer.*`; puede necesitar mover claves si se extraen al nuevo componente.
