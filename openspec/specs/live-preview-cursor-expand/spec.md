## ADDED Requirements

### Requirement: Expandir link al recibir cursor
Cuando el cursor se posicione dentro del texto de un mark `link`, el editor SHALL reemplazar visualmente el link renderizado por su sintaxis markdown raw `[texto](url)` o `[texto](url "title")` editable inline. Al salir el cursor, SHALL volver a renderizarse como link.

#### Scenario: Cursor entra en link sin título
- **WHEN** el usuario mueve el cursor con teclas de flecha hasta posicionarlo dentro del texto de un link renderizado
- **THEN** el link desaparece y en su lugar aparece el texto raw `[texto](url)` editable en la misma posición

#### Scenario: Cursor sale de link editado
- **WHEN** el usuario mueve el cursor fuera del rango del link (o hace clic fuera)
- **THEN** el texto raw se convierte de nuevo en el link renderizado con la URL actualizada si el usuario la modificó

#### Scenario: Cursor entra en link con título
- **WHEN** el cursor entra en un link que tiene atributo title
- **THEN** se muestra `[texto](url "title")` con las tres partes editables

### Requirement: Expandir imagen al ser seleccionada
Cuando el cursor seleccione un nodo `image` (nodo atómico), el editor SHALL mostrar su sintaxis markdown `![alt](src)` o `![alt](src "title")` editable inline. Al deseleccionar, SHALL volver a mostrar la imagen renderizada.

#### Scenario: Imagen seleccionada con flecha
- **WHEN** el usuario navega con teclas de flecha hasta que el cursor selecciona un nodo imagen
- **THEN** la imagen renderizada se reemplaza por el texto raw `![alt](src)` editable

#### Scenario: Imagen deseleccionada con cambio de alt
- **WHEN** el usuario modifica el alt text en el texto raw y mueve el cursor fuera
- **THEN** la imagen se re-renderiza con el nuevo alt text

### Requirement: Expandir negrita al recibir cursor
Cuando el cursor se posicione dentro de un mark `strong`, el editor SHALL mostrar el texto con los delimitadores `**texto**` editables inline. Al salir, SHALL restaurar el render en negrita.

#### Scenario: Cursor entra en negrita
- **WHEN** el cursor entra en un fragmento de texto con mark strong
- **THEN** aparece el texto rodeado de `**` en ambos extremos, editable

#### Scenario: Cursor sale de negrita sin cambios
- **WHEN** el cursor sale sin modificar el texto
- **THEN** el texto vuelve a mostrarse en negrita sin transacción en el historial de undo

### Requirement: Expandir cursiva al recibir cursor
Cuando el cursor se posicione dentro de un mark `em`, el editor SHALL mostrar `_texto_` editable. Al salir SHALL restaurar el render en cursiva.

#### Scenario: Cursor entra en cursiva
- **WHEN** el cursor entra en texto con mark em
- **THEN** aparece `_texto_` editable inline

### Requirement: Expandir código inline al recibir cursor
Cuando el cursor se posicione dentro de un mark `code`, el editor SHALL mostrar `` `texto` `` editable. Al salir SHALL restaurar el render con fuente monoespaciada.

#### Scenario: Cursor entra en código inline
- **WHEN** el cursor entra en texto con mark code
- **THEN** aparece `` `texto` `` editable inline

#### Scenario: Cursor sale y el código fue modificado
- **WHEN** el usuario modifica el texto dentro de los backticks y mueve el cursor fuera
- **THEN** el mark code se actualiza con el nuevo texto y se vuelve a renderizar
