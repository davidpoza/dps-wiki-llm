## MODIFIED Requirements

### Requirement: El modal de búsqueda es funcional fuera del explorer

El sistema SHALL permitir buscar notas por su **contenido** desde el modal de búsqueda, independientemente de la ruta desde la que se abre, consultando el índice de contenido del backend (título, ruta y cuerpo de la nota) en lugar de filtrar únicamente por nombre de archivo en el cliente.

#### Scenario: Búsqueda disponible desde cualquier ruta

- **WHEN** el usuario abre el modal desde una ruta como `/jobs` y escribe una consulta
- **THEN** el modal muestra resultados provenientes del índice de contenido del backend

#### Scenario: La búsqueda coincide con el contenido de las notas

- **WHEN** el usuario escribe un término que aparece en el cuerpo de una nota pero no en su nombre de archivo
- **THEN** esa nota aparece en los resultados de búsqueda

#### Scenario: La búsqueda coincide con el nombre o la ruta del archivo

- **WHEN** el usuario escribe un término que aparece en la ruta o el título de una nota
- **THEN** esa nota aparece en los resultados de búsqueda

#### Scenario: Cada resultado muestra la ruta completa

- **WHEN** se muestran resultados de búsqueda
- **THEN** cada resultado muestra la ruta completa del archivo dentro del vault

#### Scenario: Consulta vacía no muestra resultados

- **WHEN** el input de búsqueda está vacío
- **THEN** el modal no muestra resultados de contenido
