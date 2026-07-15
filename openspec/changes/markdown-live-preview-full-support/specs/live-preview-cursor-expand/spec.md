## ADDED Requirements

### Requirement: Elementos de bloque con estilo visual completo en estado renderizado
Cuando el editor muestre nodos de bloque en estado renderizado (cursor fuera del elemento), SHALL aplicar estilos visuales que distingan claramente cada tipo de elemento.

#### Scenario: Headings visualmente diferenciados
- **WHEN** el documento contiene headings de niveles 1 a 6 y el cursor está fuera de ellos
- **THEN** cada nivel muestra un tamaño de fuente y peso distintos, decrecientes de h1 a h6

#### Scenario: Blockquote con borde visual
- **WHEN** el documento contiene un blockquote y el cursor está fuera de él
- **THEN** el blockquote muestra un borde izquierdo de color y padding horizontal

#### Scenario: Listas con bullets y números
- **WHEN** el documento contiene bullet lists y ordered lists y el cursor está fuera de ellas
- **THEN** cada ítem de bullet list muestra un `•` y cada ítem de ordered list muestra su número

#### Scenario: Code block con fondo diferenciado
- **WHEN** el documento contiene un code block y el cursor está fuera de él
- **THEN** el code block muestra fondo de color diferente al del editor, con fuente monoespaciada

#### Scenario: Horizontal rule visible
- **WHEN** el documento contiene un horizontal rule y el cursor está fuera de él
- **THEN** se muestra una línea horizontal de separación visible (`<hr>`)
