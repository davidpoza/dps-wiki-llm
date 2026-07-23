## Why

Actualmente el explorador de ficheros (`/explorer`) no sincroniza el fichero abierto con la URL: seleccionar un documento no cambia la ruta, por lo que no es posible compartir un enlace directo a un fichero ni navegar con el botón atrás. Añadir rutas basadas en la ruta del fichero convierte cada documento en una página direccionable, mejorando la experiencia de navegación.

## What Changes

- La ruta `/explorer` pasa a ser el punto de entrada que muestra el árbol vacío sin fichero seleccionado.
- Se añade la ruta `/explorer/**` (wildcard) que recibe la ruta completa del fichero como parámetro de URL (p. ej. `/explorer/carpeta/doc.md`).
- Al seleccionar un nodo en el árbol, el router navega a `/explorer/<ruta-del-fichero>`.
- Al cargar `/explorer/<ruta>`, el componente extrae la ruta del fichero de la URL y abre ese documento automáticamente.
- El botón atrás del navegador vuelve al estado anterior (fichero anterior o explorador vacío).
- Se añade una ruta `/viewer/**` de solo lectura para visualizar documentos sin editor (sin barra de acciones de escritura, sin guardado). **BREAKING**: nueva ruta visible externamente.

## Capabilities

### New Capabilities

- `explorer-file-routing`: Sincronización bidireccional entre el fichero seleccionado en el explorador y la URL (`/explorer/**`). Incluye deep-link, navegación con historial del navegador y apertura automática al llegar por URL.
- `document-viewer`: Página de solo lectura accesible en `/viewer/**` que renderiza un documento Markdown sin controles de edición. Útil para compartir documentos con usuarios que no necesitan editar.

### Modified Capabilities

<!-- No hay cambios en requisitos de capabilities existentes. -->

## Impact

- `frontend/src/main.ts`: nuevas rutas `explorer/:filePath` (wildcard) y `viewer/**`.
- `frontend/src/app/components/explorer.component.ts`: leer `ActivatedRoute`, navegar al seleccionar nodo, restaurar selección al inicializar.
- Nuevo componente `document-viewer.component.ts` para la ruta de solo lectura.
- Guards `authGuard` y `unsavedChangesGuard` se mantienen en la ruta del explorador.
