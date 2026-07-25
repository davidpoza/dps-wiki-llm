## ADDED Requirements

### Requirement: Modal muestra justificación LLM de la relación entre dos notas

Al seleccionar "Explicar enlace" del menú contextual, el sistema SHALL abrir un modal `p-dialog` que llame al endpoint `POST /api/notes/explain-link` con la ruta de la nota actual (origen) y la ruta resuelta del wikilink (destino), y SHALL mostrar la respuesta del LLM. Durante la llamada SHALL mostrarse un indicador de carga. En caso de error SHALL mostrarse un mensaje de error sin cerrar el modal.

#### Scenario: Modal se abre al seleccionar "Explicar enlace"

- **WHEN** el usuario selecciona la opción "Explicar enlace" del menú contextual sobre un wikilink
- **THEN** el menú contextual desaparece
- **THEN** se abre un modal con el título "Relación entre notas"
- **THEN** el modal muestra un indicador de carga mientras espera la respuesta del LLM

#### Scenario: Modal muestra la justificación al recibir respuesta

- **WHEN** el endpoint `POST /api/notes/explain-link` devuelve 200 con la explicación
- **THEN** el indicador de carga desaparece
- **THEN** el modal muestra el texto de la explicación del LLM

#### Scenario: Modal muestra error si la llamada falla

- **WHEN** el endpoint devuelve un error (4xx o 5xx) o hay un error de red
- **THEN** el indicador de carga desaparece
- **THEN** el modal muestra el mensaje "No se pudo obtener la explicación. Inténtalo de nuevo."

#### Scenario: Modal muestra error si la nota destino no existe

- **WHEN** el endpoint devuelve 404 (nota destino no encontrada)
- **THEN** el modal muestra el mensaje "La nota enlazada no existe."

#### Scenario: Modal se cierra con el botón de cierre

- **WHEN** el modal está abierto y el usuario hace clic en el botón de cierre o fuera del modal
- **THEN** el modal se cierra

#### Scenario: El header del modal incluye los nombres de ambas notas

- **WHEN** el modal está abierto para explicar la relación entre "nota-origen.md" y "wiki/concepts/glutamina.md"
- **THEN** el header del modal muestra los nombres de ambas notas (sin la ruta completa ni la extensión)
