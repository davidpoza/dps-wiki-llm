## 1. Nuevos signals y método toggle

- [x] 1.1 Añadir `readonly editorMode = signal<'wysiwyg' | 'raw'>('wysiwyg')` junto a los otros signals de estado del editor (cerca de `isDirty`)
- [x] 1.2 Añadir `readonly rawModeText = signal('')` junto al signal anterior
- [x] 1.3 Añadir el método `toggleEditorMode()`:
  ```ts
  toggleEditorMode(): void {
    if (this.editorMode() === 'wysiwyg') {
      this.rawModeText.set(this.currentFullContent());
      this.editorMode.set('raw');
    } else {
      const raw = this.rawModeText();
      const parsed = this.parseFrontmatter(raw);
      this.frontmatter.set(parsed.data);
      this.frontmatterRawYaml.set(raw.startsWith('---') ? (raw.split('---')[1] ?? '') : '');
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

## 2. Reset de modo al cargar fichero

- [x] 2.1 En `loadFile()` (línea ~2012) y en `loadFileByPath()` (línea ~1894), añadir `this.editorMode.set('wysiwyg')` en los primeros pasos del `next:` callback, antes de actualizar `selectedPath`

## 3. Guardar en modo raw

- [x] 3.1 En el método `save()` (línea ~2231), al construir `fullContent`, añadir guarda al inicio:
  ```ts
  const fullContent = this.editorMode() === 'raw'
    ? this.rawModeText()
    : (Object.keys(fm).length > 0 ? this.stringifyWithFrontmatter(this.currentMarkdown, fm) : this.currentMarkdown);
  ```

## 4. Template: botón toggle en toolbar

- [x] 4.1 En `.toolbar-group`, añadir botón toggle antes o después del botón de sync:
  ```html
  <p-button
    icon="pi pi-code"
    size="small"
    severity="secondary"
    [text]="true"
    title="Modo raw"
    [class.sidebar-btn-active]="editorMode() === 'raw'"
    [disabled]="!selectedPath()"
    (onClick)="toggleEditorMode()"
  />
  ```
- [x] 4.2 En los botones "Insertar tabla" y "Enriquecer" (pi-sparkles), añadir `[disabled]="editorMode() === 'raw'"` (en el de tabla reemplazar o combinar con la condición existente si la hubiera)

## 5. Template: mostrar textarea raw y ocultar Milkdown

- [x] 5.1 En `<div #editorContainer class="milkdown-container" [class.hidden]="!selectedPath()">`, cambiar la condición a `[class.hidden]="!selectedPath() || editorMode() === 'raw'"`
- [x] 5.2 Justo después del `milkdown-container`, añadir el textarea raw:
  ```html
  @if (selectedPath() && editorMode() === 'raw') {
    <textarea
      class="raw-textarea"
      [value]="rawModeText()"
      (input)="rawModeText.set($any($event.target).value); isDirty.set(true)"
      spellcheck="false"
      autocomplete="off"
    ></textarea>
  }
  ```

## 6. CSS para el textarea raw

- [x] 6.1 Añadir estilos para `.raw-textarea` junto a los estilos de `.milkdown-container`:
  ```css
  .raw-textarea {
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    padding: 16px;
    font-family: monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    border: none;
    outline: none;
    resize: none;
    background: var(--app-surface);
    color: var(--app-text);
    overflow-y: auto;
  }
  ```

## 7. Verificación

- [x] 7.1 Abrir un fichero con frontmatter → pulsar toggle raw → verificar que se ve el frontmatter y el cuerpo completos
- [x] 7.2 Editar en raw → guardar → verificar que se guarda el contenido bruto correctamente
- [x] 7.3 Editar en raw → volver a WYSIWYG → verificar que Milkdown muestra el cuerpo actualizado y el frontmatter panel refleja los cambios
- [x] 7.4 Verificar que Insertar tabla y Enriquecer están deshabilitados en modo raw
- [x] 7.5 Cambiar de fichero en modo raw → verificar que el nuevo fichero abre en modo WYSIWYG
