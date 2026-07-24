## Context

El explorer usa un layout de tres columnas (`sidebar-toolbar` | `file-tree-panel` | `editor-panel`). El panel lateral actualmente se controla con el signal `treePanelCollapsed: signal<boolean>`. El contenido markdown se guarda en el campo privado `currentMarkdown: string`. El editor Milkdown monta su DOM en `this.editorContainer.nativeElement` (`<div #editorContainer class="milkdown-container">`), que es el contenedor con `overflow-y: auto` — el scrollable real del editor.

## Goals / Non-Goals

**Goals:**
- Reemplazar el botón chevron con dos botones toggle (files / TOC) en `sidebar-toolbar`
- El panel lateral muestra `p-tree` o TOC según el modo activo; el ancho y el resizer no cambian
- La TOC se extrae con regex del markdown actual y se recalcula en cada cambio
- Click en heading → scroll suave hasta el elemento `h1`–`h6` correspondiente dentro de `.milkdown-container`
- El icono activo se resalta visualmente

**Non-Goals:**
- TOC persistente en localStorage (el modo sidebar sí puede persistirse si se desea en el futuro)
- Soporte de headings en HTML embebido o frontmatter
- Nested indentation en forma de árbol colapsable (solo lista con indent visual)

## Decisions

### D1: Signal `sidebarPanel: 'collapsed' | 'files' | 'toc'` reemplaza `treePanelCollapsed`

`treePanelCollapsed` era un `signal<boolean>`. Se convierte en un `computed` derivado de `sidebarPanel` para mantener compatibilidad con los usos existentes (resizer, media query mobile):

```ts
readonly sidebarPanel = signal<'collapsed' | 'files' | 'toc'>(
  window.innerWidth < 768 ? 'collapsed' : 'files'
);
readonly treePanelCollapsed = computed(() => this.sidebarPanel() === 'collapsed');
```

Todos los sitios que llaman `this.treePanelCollapsed.set(true)` o `.update(v => !v)` deben migrar a `this.sidebarPanel.set('collapsed')` / el nuevo toggle.

**Alternativa descartada**: mantener `treePanelCollapsed` como signal y añadir `sidebarMode: 'files' | 'toc'` por separado — requiere dos signals sincronizados y complica el toggle.

### D2: Extraer headings con regex del markdown en un signal

Añadir `readonly tocMarkdown = signal('')` que se actualiza junto con `currentMarkdown`. Derivar headings con `computed()`:

```ts
readonly tocHeadings = computed(() => {
  const re = /^(#{1,6})\s+(.+)/gm;
  const results: { level: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(this.tocMarkdown())) !== null) {
    results.push({ level: m[1].length, text: m[2].trim() });
  }
  return results;
});
```

**Alternativa descartada**: leer headings del DOM del editor — más frágil (requiere timing post-render) y no reactivo.

### D3: Scroll al heading mediante query DOM en `editorContainer`

```ts
scrollToHeading(text: string): void {
  const headings = this.editorContainer.nativeElement
    .querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6');
  const target = Array.from(headings).find(el => el.textContent?.trim() === text);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

El contenedor scrollable es `.milkdown-container` (tiene `overflow-y: auto`). `scrollIntoView` funciona correctamente sobre el ancestro overflow.

### D4: Renderizado de TOC en el template

La TOC se renderiza como lista dentro de `.file-tree-panel`, reemplazando (condicionalmente) al `p-tree`. Indentación con `padding-left: calc((level - 1) * 12px)`.

```html
@if (sidebarPanel() === 'toc') {
  <div class="toc-panel">
    @if (!selectedPath()) {
      <p class="toc-empty">Abre un fichero para ver su índice</p>
    } @else if (tocHeadings().length === 0) {
      <p class="toc-empty">Sin encabezados</p>
    } @else {
      @for (h of tocHeadings(); track $index) {
        <button class="toc-item" [style.padding-left.px]="(h.level - 1) * 12 + 8" (click)="scrollToHeading(h.text)">
          {{ h.text }}
        </button>
      }
    }
  </div>
}
```

## Risks / Trade-offs

- [Riesgo: heading con texto duplicado] → `scrollIntoView` irá al primero encontrado, comportamiento aceptable.
- [Riesgo: `tocMarkdown` desincronizado con `currentMarkdown`] → Mitigación: actualizar `tocMarkdown` en todos los puntos donde se actualiza `currentMarkdown` (búsqueda con `this.currentMarkdown =`).
- [Trade-off: regex simple] → No maneja headings dentro de bloques de código fenced (```) — mejora diferida.
