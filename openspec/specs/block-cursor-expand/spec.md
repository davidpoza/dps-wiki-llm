# block-cursor-expand Specification

## Purpose
TBD - created by archiving change markdown-live-preview-full-support. Update Purpose after archive.
## Requirements
### Requirement: Expandir heading al recibir cursor
Cuando el cursor se posicione dentro de un nodo `heading` (h1-h6), el editor SHALL reemplazar el nodo renderizado por su sintaxis markdown raw `# texto`, `## texto`, etc. editable inline. Al salir el cursor, SHALL volver a renderizarse como heading.

#### Scenario: Cursor entra en heading h1
- **WHEN** el usuario coloca el cursor dentro de un nodo heading de nivel 1
- **THEN** el heading renderizado desaparece y aparece `# texto` como texto plano editable en la misma posición

#### Scenario: Cursor entra en heading h2
- **WHEN** el usuario coloca el cursor dentro de un nodo heading de nivel 2
- **THEN** aparece `## texto` editable inline

#### Scenario: Cursor sale de heading sin cambios
- **WHEN** el usuario mueve el cursor fuera del rango del heading expandido sin modificar el texto
- **THEN** el heading se vuelve a renderizar con el nivel original sin añadir entrada al historial de undo

#### Scenario: Cursor sale de heading con nivel cambiado
- **WHEN** el usuario modifica los `#` del prefijo (p.ej. de `# ` a `## `) y mueve el cursor fuera
- **THEN** el nodo se recrea como heading del nuevo nivel

#### Scenario: Cursor sale de heading con texto vacío
- **WHEN** el usuario borra todo el texto raw y mueve el cursor fuera
- **THEN** el nodo heading se elimina del documento

### Requirement: Expandir blockquote al recibir cursor
Cuando el cursor se posicione dentro del primer párrafo de un nodo `blockquote`, el editor SHALL mostrar su contenido con prefijo `> ` editable. Al salir, SHALL restaurar el render del blockquote.

#### Scenario: Cursor entra en blockquote
- **WHEN** el usuario coloca el cursor dentro de un nodo blockquote
- **THEN** aparece `> texto` como texto plano editable

#### Scenario: Cursor sale de blockquote editado
- **WHEN** el usuario modifica el texto dentro de `> ` y mueve el cursor fuera
- **THEN** el blockquote se re-renderiza con el nuevo contenido

#### Scenario: Blockquote expandido sin prefijo al salir
- **WHEN** el usuario elimina el prefijo `> ` del texto raw y mueve el cursor fuera
- **THEN** el contenido se convierte en un párrafo normal (sin blockquote)

### Requirement: Expandir list item al recibir cursor
Cuando el cursor se posicione dentro de un `list_item` (de bullet list u ordered list), el editor SHALL mostrar el contenido con el prefijo de lista (`- ` o `1. `) editable. Al salir, SHALL restaurar el nodo de lista.

#### Scenario: Cursor entra en bullet list item
- **WHEN** el usuario coloca el cursor dentro de un ítem de bullet list
- **THEN** aparece `- texto` como texto plano editable

#### Scenario: Cursor entra en ordered list item
- **WHEN** el usuario coloca el cursor dentro de un ítem de ordered list
- **THEN** aparece `1. texto` como texto plano editable

#### Scenario: Cursor sale de list item sin cambios
- **WHEN** el usuario mueve el cursor fuera sin modificar el texto
- **THEN** el list item se vuelve a renderizar sin entrada en el historial de undo

#### Scenario: Cursor sale de list item con texto modificado
- **WHEN** el usuario edita el texto del list item y mueve el cursor fuera
- **THEN** el list item se actualiza con el nuevo texto

### Requirement: Expandir code block al recibir cursor
Cuando el cursor se posicione dentro de un nodo `code_block`, el editor SHALL mostrar las fences ` ``` ` con el lenguaje y el contenido editables. Al salir, SHALL restaurar el nodo code_block.

#### Scenario: Cursor entra en code block con lenguaje
- **WHEN** el usuario coloca el cursor dentro de un nodo code_block con atributo `language: "javascript"`
- **THEN** aparece ` ```javascript\ncontenido\n``` ` editable

#### Scenario: Cursor entra en code block sin lenguaje
- **WHEN** el usuario coloca el cursor dentro de un nodo code_block sin lenguaje
- **THEN** aparece ` ```\ncontenido\n``` ` editable

#### Scenario: Cursor sale de code block con lenguaje cambiado
- **WHEN** el usuario modifica el lenguaje en la fence de apertura y mueve el cursor fuera
- **THEN** el nodo code_block se recrea con el nuevo atributo `language`

#### Scenario: Cursor sale de code block con contenido modificado
- **WHEN** el usuario edita el contenido del code block y mueve el cursor fuera
- **THEN** el code_block se actualiza con el nuevo contenido

### Requirement: Horizontal rule con cursor visible
Cuando el cursor se posicione en un nodo `horizontal_rule`, el editor SHALL mostrar su sintaxis raw `---` editable. Al salir, SHALL restaurar el render del `<hr>`.

#### Scenario: Cursor entra en horizontal rule
- **WHEN** el usuario selecciona un nodo horizontal_rule con las teclas de flecha
- **THEN** aparece `---` como texto plano editable

#### Scenario: Cursor sale de horizontal rule sin cambios
- **WHEN** el usuario mueve el cursor fuera del horizontal_rule
- **THEN** el nodo `<hr>` se vuelve a renderizar

