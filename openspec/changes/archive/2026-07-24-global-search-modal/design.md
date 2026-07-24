## Context

El modal de búsqueda de ficheros (shortcut `Ctrl+P`) está implementado directamente en `ExplorerComponent` con un `@HostListener('document:keydown.control.p')`. Esto significa que el listener solo se registra cuando el componente está activo, es decir, únicamente en las rutas `/explorer` y `/explorer/**`. En el resto de rutas (jobs, ingest, chat, review, git, settings, profile) el shortcut no tiene efecto.

La app usa Angular standalone components con señales. `FileService.getTree()` es la fuente de datos del árbol de ficheros. El modal existente es un `<p-dialog>` con input de búsqueda y lista de resultados navegable con teclado.

## Goals / Non-Goals

**Goals:**
- `Ctrl+P` funciona desde cualquier ruta autenticada de la app.
- Seleccionar un archivo navega a `/explorer/<path>`.
- El comportamiento actual dentro del explorer (confirm unsaved changes) se preserva.
- No se duplica lógica de búsqueda ni se replica el árbol de ficheros.

**Non-Goals:**
- Cambiar el diseño visual del modal.
- Soporte para búsqueda en contenido de archivos (solo por nombre de ruta).
- Soporte en la pantalla de login.

## Decisions

### 1. Montar el modal en AppComponent

**Decisión**: El `GlobalSearchModalComponent` se añade al template de `AppComponent`, fuera del `<router-outlet>`, para que siempre esté en el DOM independientemente de la ruta.

**Alternativas consideradas**:
- Añadirlo al `HomeComponent` — no cubre `SettingsComponent` ni `ProfileComponent`.
- Usar un portal/overlay service de Angular CDK — añade dependencia externa innecesaria.

**Rationale**: `AppComponent` es el único componente siempre presente. Es el sitio natural para elementos globales (ya alberga el spinner global).

---

### 2. GlobalSearchService como coordinador

**Decisión**: Crear un servicio `GlobalSearchService` (providedIn root) con:
- `open()`: signal o subject para abrir el modal.
- `fileSelected$`: observable/signal que emite el path del archivo seleccionado.

**Alternativas consideradas**:
- Pasar eventos directamente via `Router` queryParams — acoplamiento excesivo con la URL.
- Comunicar via `Input`/`Output` entre componentes — imposible entre `AppComponent` y `ExplorerComponent` sin un intermediario.

**Rationale**: Un servicio singleton es el patrón estándar de Angular para comunicación entre componentes no relacionados jerárquicamente. Mantiene los componentes desacoplados.

---

### 3. ExplorerComponent se suscribe al servicio, no registra su propio HostListener

**Decisión**: `ExplorerComponent` elimina su `@HostListener('document:keydown.control.p')` y en su lugar se suscribe a `GlobalSearchService.fileSelected$` para manejar la navegación con confirmación de cambios sin guardar.

**Rationale**: Evita que haya dos listeners compitiendo cuando el usuario está en el explorer. El `HostListener` del `GlobalSearchModalComponent` (en AppComponent) siempre gana; el explorer solo necesita reaccionar a la selección.

---

### 4. El HostListener global vive en GlobalSearchModalComponent

**Decisión**: El `@HostListener('document:keydown.control.p')` se coloca en `GlobalSearchModalComponent` (no en `AppComponent`), para mantener la lógica del shortcut junto al componente que lo gestiona.

**Rationale**: Cohesión: el componente que abre el modal conoce también el trigger para hacerlo.

---

### 5. Navegación desde rutas no-explorer

**Decisión**: Cuando `fileSelected$` emite y la ruta actual NO es `/explorer/**`, se usa `Router.navigate(['/explorer', path])`. Cuando SÍ es explorer, se delega a la lógica existente de `ExplorerComponent` (que ya gestiona unsaved changes).

**Rationale**: Reutiliza la navegación ya probada en explorer para el caso ya conocido; el caso nuevo (otras rutas) es simple y no necesita confirmación de cambios.

## Risks / Trade-offs

- **[Riesgo] Doble suscripción al árbol de ficheros**: `GlobalSearchModalComponent` necesita acceder al árbol de ficheros (actualmente cargado en `ExplorerComponent`). Si `FileService` mantiene el árbol en un BehaviorSubject/signal compartido (que es lo que hace `getTree()`), no hay problema — el modal lo consume sin coste adicional. Si el árbol solo se carga cuando el explorer está activo, el modal podría mostrar una lista vacía.
  → **Mitigación**: Verificar que `FileService.getTree()` retorna datos en caché o hace la petición si no hay datos. Si no, inicializar el árbol en el servicio cuando el usuario está autenticado.

- **[Riesgo] Conflicto de shortcuts en campos de texto**: `Ctrl+P` puede interferir si el usuario está escribiendo en un input o textarea.
  → **Mitigación**: En el `HostListener`, verificar si el `event.target` es un input/textarea con lógica específica (ej. en el editor CodeMirror) y omitir si procede. El comportamiento actual ya hace `event.preventDefault()`, mantener eso.

- **[Trade-off] Extracción parcial del template del explorer**: El modal HTML actualmente en `explorer.component.ts` (líneas ~320-360) se mueve a `GlobalSearchModalComponent`. Esto reduce el tamaño de explorer pero requiere que las claves i18n sean accesibles desde el nuevo componente (son strings genéricas de `explorer.*` que siguen funcionando).

## Migration Plan

1. Crear `GlobalSearchService` con señales de apertura y selección.
2. Crear `GlobalSearchModalComponent` extrayendo el template y lógica del modal de `ExplorerComponent`.
3. Añadir `GlobalSearchModalComponent` al template de `AppComponent`.
4. Adaptar `ExplorerComponent` para suscribirse al servicio en lugar de gestionar el modal directamente.
5. Verificar que `FileService` expone el árbol de ficheros de forma que funcione fuera del contexto del explorer.

Sin rollback complejo: los cambios son aditivos (nuevo servicio, nuevo componente) y la modificación a `ExplorerComponent` es una sustitución de lógica existente.
