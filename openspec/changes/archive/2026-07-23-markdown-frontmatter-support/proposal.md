## Why

Los ficheros Markdown del wiki contienen cabeceras YAML frontmatter (`---` ... `---`) con metadatos como `title`, `tags`, `date` o `author`. Actualmente Milkdown interpreta el bloque `---` como separadores horizontales, corrompiendo visualmente el contenido y mezclando metadatos con el cuerpo editable. El usuario necesita ver y distinguir los metadatos del contenido real del documento.

## What Changes

- El frontend parseará el frontmatter YAML antes de cargar el contenido en Milkdown, separando metadatos de cuerpo editorial.
- Se mostrará un panel de metadatos (encima del editor) con los campos del frontmatter como pares clave-valor en modo lectura.
- Milkdown recibirá únicamente el cuerpo del documento (sin el bloque frontmatter), evitando la corrupción visual.
- Al guardar, el frontend recompondrá el fichero con el frontmatter original prepended al cuerpo editado.

## Capabilities

### New Capabilities

- `frontmatter-panel`: Panel de visualización de metadatos YAML extraídos del fichero Markdown, mostrado encima del editor como campos clave-valor en modo lectura (no editable en esta iteración).

### Modified Capabilities

- `markdown-editor`: El ciclo de carga y guardado cambia para separar frontmatter del cuerpo antes de enviar a Milkdown, y para recomponer el fichero completo al guardar.

## Impact

- **Frontend**: Nueva dependencia `gray-matter` (o parseo manual con regex) para extraer frontmatter. `ExplorerComponent` actualizado para gestionar `frontmatter` y `body` por separado. Nuevo sub-componente o sección `FrontmatterPanelComponent` en la vista del editor.
- **Backend**: Sin cambios. El backend sigue recibiendo y almacenando el contenido completo del fichero (frontmatter + cuerpo).
- **Dependencias**: `gray-matter` (npm) para parseo robusto de YAML frontmatter.
