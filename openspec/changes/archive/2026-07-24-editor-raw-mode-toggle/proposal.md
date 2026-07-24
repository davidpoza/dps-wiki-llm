## Why

El editor Milkdown (WYSIWYG) ofrece una experiencia visual agradable pero oculta el markdown en bruto. A veces el usuario necesita ver o editar el fichero completo en texto plano — incluyendo el frontmatter — sin pasar por el editor visual. Añadir un toggle en la toolbar permite cambiar entre ambos modos sin salir de la pantalla.

## What Changes

- Nuevo botón toggle en la toolbar del editor (icono `pi-code`) que alterna entre:
  - **Modo WYSIWYG**: editor Milkdown actual con live preview (comportamiento por defecto)
  - **Modo raw**: `<textarea>` simple que muestra el fichero completo (frontmatter + cuerpo) en markdown bruto
- En modo raw el textarea es editable; los cambios actualizan el estado sucio (`isDirty`) normalmente
- Al volver de raw a WYSIWYG se re-parsea el contenido del textarea para sincronizar frontmatter y cuerpo en el editor Milkdown
- Los botones exclusivos del editor WYSIWYG ("Insertar tabla", "Enriquecer") se deshabilitan en modo raw
- El guardado (`Ctrl+S` y botón guardar) funciona igual en ambos modos

## Capabilities

### New Capabilities

- `editor-raw-mode`: Modo de edición raw en el explorer con textarea que muestra el fichero markdown completo

### Modified Capabilities

_(ninguna — la lógica de guardado, sync y frontmatter no cambia en su interfaz pública)_

## Impact

- `frontend/src/app/components/explorer.component.ts` — nuevo signal `editorMode`, signal `rawModeText`, método `toggleEditorMode()`, ajuste del template (toolbar + área de editor) y CSS para el textarea raw
- Sin cambios en backend ni API
