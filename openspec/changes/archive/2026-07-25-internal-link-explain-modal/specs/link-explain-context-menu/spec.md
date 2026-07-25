## ADDED Requirements

### Requirement: Clic derecho sobre wikilink muestra menú contextual con opción "Explicar enlace"

El plugin de wikilinks SHALL interceptar el evento `contextmenu` sobre elementos con clase `wikilink-token`, suprimir el menú nativo del navegador y emitir un callback con el target del wikilink y las coordenadas del evento. El componente editor SHALL mostrar un menú contextual flotante con la opción "Explicar enlace" en la posición del cursor.

#### Scenario: Menú aparece al hacer clic derecho sobre wikilink

- **WHEN** el usuario hace clic derecho sobre texto decorado con la clase `wikilink-token` en el editor
- **THEN** el menú contextual nativo del navegador es suprimido
- **THEN** aparece un menú flotante con la opción "Explicar enlace" en las coordenadas del evento

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
