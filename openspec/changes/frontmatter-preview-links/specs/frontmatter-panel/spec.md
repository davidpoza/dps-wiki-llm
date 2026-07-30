## ADDED Requirements

### Requirement: Enlaces clicables en los valores de metadatos

El panel de metadatos en modo lectura SHALL analizar cada valor mostrado y renderizar los enlaces reconocidos como elementos clicables en lugar de texto plano. SHALL reconocer dos tipos de enlace embebidos en un valor: enlaces externos (URLs `http://` o `https://`) y enlaces internos del wiki en sintaxis wikilink (`[[Nota]]` o `[[Nota|alias]]`). El texto que no forme parte de un enlace SHALL seguir mostrándose como texto plano.

#### Scenario: Valor con enlace externo

- **WHEN** un valor del frontmatter contiene una URL `https://ejemplo.com/pagina` y el usuario hace clic sobre ella
- **THEN** la URL SHALL abrirse en una pestaña nueva del navegador con `rel="noopener noreferrer"`, sin salir de la aplicación actual

#### Scenario: Valor con enlace interno (wikilink) que resuelve

- **WHEN** un valor del frontmatter contiene `[[Otra Nota]]`, existe una nota que resuelve a ese destino y el usuario hace clic sobre el enlace
- **THEN** la aplicación SHALL navegar a esa nota dentro del wiki reutilizando el flujo de navegación de wikilinks existente

#### Scenario: Enlace interno roto

- **WHEN** un valor del frontmatter contiene `[[Nota Inexistente]]` que no resuelve a ningún fichero y el usuario hace clic sobre él
- **THEN** la aplicación SHALL mostrar el aviso de enlace roto y NO SHALL cambiar de fichero

#### Scenario: Enlace interno con alias

- **WHEN** un valor contiene `[[Objetivo|texto visible]]`
- **THEN** el panel SHALL mostrar `texto visible` como texto del enlace y al hacer clic SHALL navegar al destino `Objetivo`

#### Scenario: Valor de tipo lista con varios enlaces

- **WHEN** un valor del frontmatter es una lista (array) como `[[A]]`, `[[B]]`
- **THEN** cada elemento SHALL analizarse de forma independiente y renderizarse como un enlace clicable separado

#### Scenario: Texto mixto con y sin enlaces

- **WHEN** un valor combina texto plano y un enlace, por ejemplo `ver https://ejemplo.com para más detalles`
- **THEN** solo el segmento del enlace SHALL ser clicable y el resto SHALL permanecer como texto no interactivo

#### Scenario: Valor sin enlaces

- **WHEN** un valor del frontmatter no contiene ninguna URL ni wikilink
- **THEN** el valor SHALL renderizarse como texto plano, igual que antes de esta funcionalidad

#### Scenario: Enlaces solo en modo lectura

- **WHEN** el panel de metadatos está en modo edición de YAML
- **THEN** el área de texto editable SHALL mostrar el contenido como texto plano y NO SHALL convertir los enlaces en elementos clicables

## MODIFIED Requirements

### Requirement: Metadatos en modo solo lectura

El panel de metadatos SHALL mostrar los valores en modo solo lectura: el usuario no podrá modificar el texto de los campos del frontmatter desde la vista de lectura. Los enlaces reconocidos dentro de un valor SHALL ser clicables únicamente para navegar (abrir la URL externa o ir a la nota interna); activar un enlace SHALL considerarse navegación y NO edición del valor.

#### Scenario: Intento de edición de un campo

- **WHEN** el usuario intenta modificar el texto de un valor del panel de metadatos en la vista de lectura
- **THEN** el campo SHALL permanecer no editable

#### Scenario: Clic sobre un enlace no altera el valor

- **WHEN** el usuario hace clic sobre un enlace clicable dentro de un valor de metadatos
- **THEN** la acción SHALL ejecutar la navegación correspondiente y el valor almacenado del frontmatter NO SHALL modificarse
