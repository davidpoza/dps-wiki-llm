## 1. Refactorizar estado del sidebar

- [x] 1.1 En `explorer.component.ts`, añadir el signal `readonly sidebarPanel = signal<'collapsed' | 'files' | 'toc'>(window.innerWidth < 768 ? 'collapsed' : 'files')`
- [x] 1.2 Convertir `treePanelCollapsed` de `signal<boolean>` a `computed`: `readonly treePanelCollapsed = computed(() => this.sidebarPanel() === 'collapsed')`
- [x] 1.3 Actualizar todos los usos de `treePanelCollapsed.set(...)` y `.update(...)` en el código TypeScript para que llamen a `sidebarPanel.set(...)` en su lugar:
  - `treePanelCollapsed.set(true)` → `sidebarPanel.set('collapsed')`
  - `treePanelCollapsed.update(v => !v)` (en `toggleTreePanel`) → reemplazar el método por `toggleSidebarPanel(mode: 'files' | 'toc')` (ver tarea 1.4)
- [x] 1.4 Reemplazar `toggleTreePanel()` por `toggleSidebarPanel(mode: 'files' | 'toc')`: si `sidebarPanel()` ya es `mode`, poner `'collapsed'`; si no, poner `mode`

## 2. Extraer TOC del markdown

- [x] 2.1 Añadir `readonly tocMarkdown = signal('')` justo después de `currentMarkdown` (campo privado)
- [x] 2.2 En cada asignación `this.currentMarkdown = ...` (hay 6 en total), añadir inmediatamente después `this.tocMarkdown.set(this.currentMarkdown)`
- [x] 2.3 Añadir el computed `readonly tocHeadings = computed(() => { ... })` que ejecuta la regex `/^(#{1,6})\s+(.+)/gm` sobre `this.tocMarkdown()` y devuelve `{ level: number; text: string }[]`

## 3. Método de scroll a heading

- [x] 3.1 Añadir el método `scrollToHeading(text: string): void` que hace `querySelectorAll('h1,h2,h3,h4,h5,h6')` sobre `this.editorContainer.nativeElement`, busca el primero cuyo `textContent?.trim() === text` y llama a `scrollIntoView({ behavior: 'smooth', block: 'start' })`

## 4. Actualizar template: toolbar

- [x] 4.1 Reemplazar el botón chevron (toggle panel) de `sidebar-toolbar` por dos botones:
  - Icono archivos: `icon="pi pi-folder"` (o `pi-folder-open` cuando activo), `(onClick)="toggleSidebarPanel('files')"`; añadir clase activa cuando `sidebarPanel() === 'files'`
  - Icono TOC: `icon="pi pi-list"`, `(onClick)="toggleSidebarPanel('toc')"`; añadir clase activa cuando `sidebarPanel() === 'toc'`
- [x] 4.2 Actualizar el `[title]` de ambos botones con textos descriptivos (sin transloco, texto literal es suficiente: "Árbol de ficheros" / "Tabla de contenido")

## 5. Actualizar template: panel lateral

- [x] 5.1 Dentro de `<aside class="file-tree-panel">`, envolver el `p-tree` y el `.empty-msg` en `@if (sidebarPanel() === 'files') { ... }`
- [x] 5.2 Añadir bloque `@else if (sidebarPanel() === 'toc') { <div class="toc-panel"> ... </div> }` con:
  - Estado sin fichero: `<p class="toc-empty">Abre un fichero para ver su índice</p>`
  - Estado sin headings: `<p class="toc-empty">Sin encabezados</p>`
  - Lista de headings: `@for (h of tocHeadings(); track $index)` con `<button class="toc-item" [style.padding-left.px]="(h.level - 1) * 12 + 8" (click)="scrollToHeading(h.text)">{{ h.text }}</button>`

## 6. Añadir estilos CSS

- [x] 6.1 Añadir estilos para `.toc-panel` (flex column, `overflow-y: auto`, `height: 100%`, `padding: 6px 0`)
- [x] 6.2 Añadir estilos para `.toc-item` (display block, `width: 100%`, text-align left, borde none, background transparent, cursor pointer, `font-size: 0.82rem`, padding vertical 4px, `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`; hover con `background: var(--app-surface-subtle)`)
- [x] 6.3 Añadir estilos para `.toc-empty` (color muted, font-size small, padding 8px)
- [x] 6.4 Añadir clase `.active` para los botones de toolbar activos (color primario o fondo resaltado); aplicarla condicionalmente con `[class.active]="sidebarPanel() === 'files'"` etc.

## 7. Verificación

- [x] 7.1 Abrir un fichero con múltiples encabezados → verificar que la TOC aparece correctamente al pulsar el icono lista
- [x] 7.2 Pulsar un heading de la TOC → verificar scroll suave en el editor
- [x] 7.3 Editar el fichero añadiendo un heading nuevo → verificar que la TOC se actualiza
- [x] 7.4 Verificar que el árbol de ficheros sigue funcionando con toggle normal (click archives → colapsa/expande)
- [x] 7.5 Verificar en móvil que el panel arranca colapsado
