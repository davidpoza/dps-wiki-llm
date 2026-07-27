## MODIFIED Requirements

### Requirement: Clic derecho sobre wikilink muestra menú contextual con opción "Explicar enlace"

El plugin de wikilinks SHALL interceptar el evento `contextmenu` sobre elementos con clase `wikilink-token`, suprimir el menú nativo del navegador y emitir un callback con el target del wikilink y las coordenadas del evento. El componente editor SHALL mostrar un menú contextual flotante con las opciones "Explicar enlace" y "Ver puntuación de enlace" en la posición del cursor.

Al seleccionar "Explicar enlace", el componente SHALL resolver el target del wikilink a su ruta relativa completa dentro del vault (incluyendo subdirectorio y extensión `.md`) buscando en el árbol de ficheros en memoria, antes de abrir el modal. Si el target no se encuentra en el árbol, el modal SHALL mostrarse con el mensaje de error "La nota enlazada no existe." en lugar de hacer una llamada al backend.

Al seleccionar "Ver puntuación de enlace", el componente SHALL resolver el target a ruta completa, llamar a `GET /links/score` con la ruta del documento activo como src, y mostrar el score resultante directamente dentro del menú contextual, sin abrir un modal.

#### Scenario: Menú aparece al hacer clic derecho sobre wikilink

- **WHEN** el usuario hace clic derecho sobre texto decorado con la clase `wikilink-token` en el editor
- **THEN** el menú contextual nativo del navegador es suprimido
- **THEN** aparece un menú flotante con las opciones "Explicar enlace" y "Ver puntuación de enlace" en las coordenadas del evento

#### Scenario: Clic derecho fuera de wikilink no muestra menú

- **WHEN** el usuario hace clic derecho sobre texto que no tiene la clase `wikilink-token`
- **THEN** no se muestra ningún menú contextual personalizado y se permite el comportamiento por defecto del navegador

#### Scenario: Menú se cierra al hacer clic fuera

- **WHEN** el menú contextual de wikilink está visible y el usuario hace clic en cualquier otro punto del documento
- **THEN** el menú desaparece sin realizar ninguna acción

#### Scenario: Menú se cierra al pulsar Escape

- **WHEN** el menú contextual de wikilink está visible y el usuario pulsa la tecla Escape
- **THEN** el menú desaparece sin realizar ninguna acción

#### Scenario: El target del wikilink se extrae correctamente

- **WHEN** el usuario hace clic derecho sobre `[[wiki/concepts/glutamina|glutamina]]`
- **THEN** el callback recibe el target `wiki/concepts/glutamina` (la parte antes del `|`)

#### Scenario: Explicar enlace resuelve ruta completa antes de llamar al backend

- **WHEN** el usuario selecciona "Explicar enlace" sobre `[[My Note]]` y "My Note" existe en el vault como `folder/My Note.md`
- **THEN** el modal se abre y el backend recibe `targetPath = "folder/My Note.md"` (ruta relativa completa)

#### Scenario: Explicar enlace muestra error si la nota no existe en el árbol

- **WHEN** el usuario selecciona "Explicar enlace" sobre `[[Nota Inexistente]]` y no hay ningún fichero con ese nombre en el árbol
- **THEN** el modal se abre mostrando el mensaje "La nota enlazada no existe." sin llamar al backend

#### Scenario: Ver puntuación muestra similitud en el menú

- **WHEN** el usuario selecciona "Ver puntuación de enlace" sobre `[[My Note]]`
- **THEN** el menú contextual muestra "Similitud: {score}" sin abrir ningún modal adicional
