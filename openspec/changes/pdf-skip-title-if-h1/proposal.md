## Why

El PDF exportado siempre incluye el título del frontmatter como bloque de título (vía pandoc `--standalone`). Cuando la nota tiene un heading de nivel 1 (`# …`) en el cuerpo, el título aparece duplicado. La lógica actual solo lo elimina si el texto del H1 coincide exactamente con el valor de `title` en el frontmatter, pero hay notas cuyo H1 no coincide textualmente y aun así duplican visualmente el encabezado principal.

## What Changes

- La condición para suprimir el `title` del frontmatter cambia: en lugar de comparar el texto del heading con el valor del frontmatter, se comprueba únicamente si existe **algún heading de nivel 1** (`# …`) en el cuerpo de la nota.
- Si existe al menos un H1 en el cuerpo → se elimina `title` del frontmatter antes de pasarlo a pandoc.
- Si no existe ningún H1 → se conserva `title` en el frontmatter para que pandoc lo renderice como bloque de título.

## Capabilities

### New Capabilities

_(ninguna nueva — es un ajuste de comportamiento en una funcionalidad existente)_

### Modified Capabilities

- `pdf-export`: La regla de supresión del título en frontmatter pasa de "mismo texto que el H1" a "existe algún H1 en el cuerpo".

## Impact

- `FileService.java` → método `stripDuplicateFrontmatterTitle` y helper `bodyContainsHeading`.
- `FileServiceTests.java` → los tests existentes que cubren esta lógica necesitan actualizarse.
- No hay cambios de API ni de esquema de base de datos.
