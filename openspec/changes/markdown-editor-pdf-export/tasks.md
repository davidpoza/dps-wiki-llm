## 1. i18n Translation Keys

- [x] 1.1 Add `explorer.generatePdf` key to `frontend/src/assets/i18n/en.json` (value: "Generate PDF")
- [x] 1.2 Add `explorer.generatePdf` key to `frontend/src/assets/i18n/es.json` (value: "Generar PDF")

## 2. PDF Export Logic

- [x] 2.1 Add `generatePdf()` method to `ExplorerComponent` that reads the rendered HTML from `this.editorContainer.nativeElement.querySelector('.milkdown .editor')?.innerHTML`
- [x] 2.2 In `generatePdf()`, open a new browser window via `window.open('')`, write an HTML document containing the extracted content plus an inline print stylesheet, set the document title to `this.selectedLabel()`, call `win.print()`, then close the window

## 3. UI — Add PDF Button

- [x] 3.1 In the `editor-header` template block (explorer.component.ts ~line 126), add a `p-button` with `[label]="'explorer.generatePdf' | transloco"`, `size="small"`, and `(onClick)="generatePdf()"` immediately after the existing Save `p-button`

## 4. Verification

- [x] 4.1 Open a markdown file in the editor, click "Generar PDF" / "Generate PDF", confirm the browser print dialog opens with rendered content (headings, lists, code blocks visible as HTML, not raw markdown)
- [x] 4.2 Confirm the suggested PDF filename in the print dialog matches the open file name
- [x] 4.3 Confirm the Save button behaviour is unchanged (disabled when not dirty, saves on click)
