## Context

El explorador (`/explorer`) es un componente standalone de Angular con un árbol de ficheros a la izquierda y un editor Milkdown a la derecha. La selección de un nodo guarda el path en una signal interna (`selectedPath`) pero no lo refleja en la URL. No existe ninguna ruta de solo lectura.

Rutas actuales:
- `/` → HomeComponent
- `/explorer` → ExplorerComponent (editor + árbol)
- `/settings` → SettingsComponent
- `/profile` → ProfileComponent
- `/login` → LoginComponent

## Goals / Non-Goals

**Goals:**
- La URL del explorador refleja el fichero actualmente abierto (`/explorer/carpeta/doc.md`).
- Navegar directamente a una URL de fichero abre ese documento automáticamente.
- El botón atrás del navegador funciona correctamente.
- Existe una ruta de solo lectura `/viewer/**` que muestra el documento sin controles de edición.

**Non-Goals:**
- Cambiar la lógica del editor Milkdown.
- Soporte de múltiples ficheros abiertos simultáneamente (tabs).
- Autenticación diferente para la ruta de viewer.

## Decisions

### D1 — Wildcard route (`**`) para la ruta del fichero

**Elegido**: `{ path: 'explorer', children: [{ path: '**', component: ExplorerComponent }] }` junto con la ruta base `{ path: 'explorer', component: ExplorerComponent }`.

Angular no tiene un tipo de parámetro de segmento múltiple estándar, pero el wildcard `**` captura todo el segmento restante como `route.url` (array de `UrlSegment`). La ruta del fichero se reconstruye uniendo los segmentos con `/`.

**Alternativa descartada**: query param (`/explorer?file=carpeta/doc.md`). Funciona técnicamente pero los query params son semánticamente opcionales y no reflejan que el fichero forma parte de la jerarquía de la URL.

### D2 — ExplorerComponent gestiona ambas rutas (con y sin fichero)

El mismo componente sirve para `/explorer` (sin fichero) y `/explorer/**` (con fichero). Al inicializar, lee la URL y, si hay ruta de fichero, la carga. Esto evita duplicar la lógica del árbol y el editor.

**Alternativa descartada**: dos componentes separados (ExplorerComponent + ExplorerFileComponent). Añade duplicación de código y complejidad en la gestión del estado del árbol.

### D3 — DocumentViewerComponent independiente para `/viewer/**`

La ruta de solo lectura usa un componente nuevo (`DocumentViewerComponent`) que reutiliza `FileService` para cargar el contenido pero renderiza el Markdown con un renderizador de solo lectura (Milkdown sin listener de cambios o una librería ligera como `marked`). No comparte estado con el explorador.

**Alternativa descartada**: parámetro `?mode=readonly` en el explorador. Mezcla responsabilidades y complica la gestión del guard `unsavedChangesGuard`.

### D4 — Codificación de la URL

Los paths de fichero pueden contener caracteres especiales (espacios, acentos). Se usa `encodeURIComponent` al construir la URL de navegación y `decodeURIComponent` al leer los segmentos de la ruta. Angular codifica automáticamente los segmentos, así que la reconstrucción es `segments.map(s => s.path).join('/')` (Angular ya decodifica `s.path`).

## Risks / Trade-offs

- **Conflicto con `unsavedChangesGuard`**: El guard actual pregunta al usuario antes de salir si hay cambios sin guardar. Con la nueva navegación entre ficheros dentro del mismo componente, el guard se activa al cambiar de fichero. → Mitigación: el componente gestiona el cambio de fichero internamente (guarda o descarta antes de navegar) y solo delega al guard cuando se sale del explorador a otra ruta.
- **Rutas largas**: paths de fichero muy largos (> 2000 chars) pueden causar problemas en algunos servidores. → Mitigación: no se anticipa para esta wiki; se puede añadir validación en el futuro si es necesario.
- **Refresh de página**: al recargar `/explorer/ruta/fichero.md`, Angular necesita que el servidor devuelva `index.html` para cualquier ruta (ya configurado en Spring Boot como SPA). → Sin cambio adicional si el backend ya tiene la configuración de fallback.

## Migration Plan

1. Añadir nuevas rutas en `main.ts` (no elimina rutas existentes).
2. Modificar `ExplorerComponent` para leer/escribir la URL (retrocompatible: `/explorer` sin fichero sigue funcionando).
3. Añadir `DocumentViewerComponent` como nueva ruta.
4. Probar deep-link, navegación con historial y guard de cambios sin guardar.

Rollback: revertir cambios en `main.ts` y `explorer.component.ts`; eliminar `document-viewer.component.ts`.
