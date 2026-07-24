## Context

El editor vive en `explorer.component.ts`. El contenido tiene dos representaciones:
- `rawFileContent: string` — contenido completo del fichero tal como se cargó del servidor (frontmatter + cuerpo)
- `currentMarkdown: string` — solo el cuerpo (sin frontmatter), lo que edita Milkdown
- `frontmatter: signal<Record<string, unknown>>` — el frontmatter parseado
- `buildFullContent()` (línea ~2236) — reconstruye el fichero completo combinando frontmatter + `currentMarkdown`

El template tiene:
- `<div #editorContainer class="milkdown-container" [class.hidden]="!selectedPath()">` — el editor Milkdown
- Toolbar en `.editor-actions > .toolbar-group` con botones de tabla, sync; y `.doc-actions` con guardar, enriquecer, etc.

## Goals / Non-Goals

**Goals:**
- Toggle entre WYSIWYG y raw sin perder cambios no guardados
- Al entrar en raw: mostrar `buildFullContent()` (refleja ediciones pendientes de Milkdown)
- Al salir de raw: re-parsear el textarea y sincronizar Milkdown + frontmatter
- Guardar funciona igual en ambos modos
- Botones inaplicables (tabla, enriquecer) deshabilitados en modo raw

**Non-Goals:**
- Syntax highlighting en el textarea raw
- Autoguardado al cambiar de modo
- Persistir el modo entre sesiones

## Decisions

### D1: Nuevo signal `editorMode: signal<'wysiwyg' | 'raw'>`

El estado de modo es un signal. Inicializa en `'wysiwyg'`. Se resetea a `'wysiwyg'` al cargar un nuevo fichero (`loadFile()`).

### D2: `rawModeText = signal('')` para el textarea

Almacena el contenido del textarea en modo raw. Se inicializa con `buildFullContent()` al entrar en raw. Los cambios del usuario se reflejan aquí y activan `isDirty`.

### D3: `toggleEditorMode()` gestiona la sincronización bidireccional

```ts
toggleEditorMode(): void {
  if (this.editorMode() === 'wysiwyg') {
    // WYSIWYG → raw: snapshot del estado actual
    this.rawModeText.set(this.buildFullContent());
    this.editorMode.set('raw');
  } else {
    // raw → WYSIWYG: re-parsear y cargar en Milkdown
    const raw = this.rawModeText();
    const parsed = this.parseFrontmatter(raw);
    this.frontmatter.set(parsed.data);
    this.frontmatterRawYaml.set(raw.startsWith('---') ? raw.split('---')[1] ?? '' : '');
    this.currentMarkdown = parsed.content;
    this.tocMarkdown.set(parsed.content);
    if (this.editor) {
      this.isLoading = true;
      this.editor.action(replaceAll(parsed.content));
    }
    if (raw !== this.rawFileContent) this.isDirty.set(true);
    this.editorMode.set('wysiwyg');
  }
}
```

### D4: Integración en el template

- `.milkdown-container`: añadir `|| editorMode() === 'raw'` a la condición `[class.hidden]`
- Justo antes del placeholder, añadir `@if (selectedPath() && editorMode() === 'raw') { <textarea class="raw-textarea"> }`
- El textarea se enlaza con `[value]="rawModeText()"` y `(input)` actualiza `rawModeText` e `isDirty`
- Botones deshabilitados en raw: tabla, enriquecer (`[disabled]="editorMode() === 'raw'"`)

### D5: Guardar en modo raw

El método `save()` llama a `buildFullContent()` que usa `currentMarkdown` + `frontmatter`. En modo raw, estos NO están sincronizados con el textarea. Solución: añadir una guarda al inicio de `save()` — si el modo es raw, sincronizar primero (parsear `rawModeText` y actualizar `currentMarkdown`/`frontmatter`) antes de llamar al guardado normal.

Alternativa más sencilla: modificar `buildFullContent()` para que en modo raw devuelva directamente `rawModeText()`. Esta es la opción elegida por su simplicidad.

## Risks / Trade-offs

- [Riesgo: la re-sincronización al salir de raw puede fallar si el YAML del frontmatter es inválido] → La función `parseFrontmatter` ya maneja errores devolviendo el texto completo como body; el editor Milkdown recibirá el texto completo y el frontmatter quedará vacío. Es un trade-off aceptable — el usuario verá el resultado.
- [Trade-off: resetear a WYSIWYG al cargar fichero nuevo] → Evita casos borde donde el modo raw de un fichero anterior contamina la vista del nuevo fichero.
