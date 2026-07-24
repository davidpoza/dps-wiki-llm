## Context

El frontend Angular usa un layout centralizado en `home.component.scss` donde el contenedor scrollable `.workspace` tiene `width: min(1100px, calc(100vw - 32px))`, lo que hace que la scrollbar vertical aparezca en el borde derecho del contenedor centrado (mitad de la ventana) en lugar del borde derecho de la ventana. El mismo problema existe implícitamente en cualquier pantalla donde el scroll ocurra dentro de un contenedor con ancho fijo inferior al viewport.

La pantalla de historial git (`git-history.component.ts`) tiene un botón "Actualizar" (`refresh-btn`) manual que es redundante porque el jobs store conectado vía SSE actualiza el estado en tiempo real.

La pantalla de Settings es una lista vertical plana con 7+ secciones que mezcla configuración de prompts LLM con operaciones de mantenimiento del vault, haciendo la pantalla larga y sin jerarquía visual.

## Goals / Non-Goals

**Goals:**
- Mover la scrollbar al borde derecho del viewport en todas las vistas del shell principal
- Eliminar el botón de refresco manual de la pantalla de cambios (git)
- Organizar Settings en dos tabs: Prompts (configuración LLM) y Datos (operaciones de vault)

**Non-Goals:**
- Cambiar el layout del explorer (`explorer.component.ts`) que tiene su propio shell independiente
- Cambiar la lógica de carga de datos del historial git
- Modificar la API backend

## Decisions

### D1: Mover la restricción de ancho de `.workspace` a `.tab-content`

**Decisión**: En `home.component.scss`, quitar `width: min(1100px, ...)` y `margin: 0 auto` de `.workspace` (que tiene `overflow-y: auto`) y moverlos a `.tab-content`. Así el contenedor scrollable ocupa el 100% del ancho y la scrollbar aparece en el borde de la ventana.

**Alternativa descartada**: Mover el scroll al `body` o `.app-shell`. Se descarta porque `.app-shell` es un flex column de `100vh` y necesita que el scroll esté en `.workspace` para respetar la altura fija del nav.

**Detalle**: El caso `full-bleed` (chat) ya tiene override en `.workspace.full-bleed { width: 100%; }` y `.tab-content.full-bleed` — hay que ajustar estos overrides para que funcionen con la nueva estructura (el centrado ahora está en `.tab-content`, no en `.workspace`).

### D2: Eliminar botón refresh sin reemplazarlo

**Decisión**: Simplemente eliminar el elemento `<button class="refresh-btn">` y su CSS asociado. No añadir ningún indicador alternativo.

**Rationale**: El historial se actualiza automáticamente cuando cambia el estado de los jobs vía SSE. El botón era una salida de emergencia que añade ruido visual.

### D3: Usar `p-tabs` de PrimeNG para Settings

**Decisión**: Envolver las secciones actuales de Settings en un `<p-tabs>` con dos `<p-tab-panel>`:
- **Prompts**: solo la sección "Prompts del LLM"
- **Datos**: resto de secciones (Apariencia, Índice del Vault, Keywords, Health Check, Recursos, Mantenimiento, Broken Links) más el footer de versión

**Alternativa descartada**: Crear rutas separadas para cada tab. Se descarta por complejidad innecesaria; el estado de Settings no necesita URL propia.

**Importaciones**: Añadir `TabsModule` de `primeng/tabs` al array `imports` del componente.

## Risks / Trade-offs

- [Riesgo: cambio de ancho en `.tab-content`] → Si algún child component asume que su contenedor padre es el viewport (p.ej. posicionamiento absoluto o cálculos de ancho), puede descuadrarse. Mitigación: revisar visualmente jobs, ingest, review y git tras el cambio.
- [Trade-off: Settings tabs] → Al cambiar la estructura del template, se pierde el scroll continuo entre secciones; el usuario debe cambiar de tab. Es el comportamiento esperado y preferido por el usuario.
