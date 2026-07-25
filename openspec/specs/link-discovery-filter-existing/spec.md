# link-discovery-filter-existing Specification

## Requirements

### Requirement: Filtrado de enlaces ya presentes en la nota

El modal de Link Discovery SHALL excluir de sus resultados cualquier enlace cuyo slug ya aparezca como wikilink (`[[slug]]`) en cualquier parte del contenido de la nota actualmente abierta en el editor.

#### Scenario: Resultado ya enlazado queda oculto

- **WHEN** el modal de Link Discovery recibe resultados del backend
- **AND** uno o más resultados tienen un slug que ya aparece como `[[slug]]` en el contenido de la nota
- **THEN** esos resultados no se muestran en el modal

#### Scenario: Resultado no enlazado sí se muestra

- **WHEN** el modal de Link Discovery recibe resultados del backend
- **AND** un resultado tiene un slug que no aparece como wikilink en el contenido de la nota
- **THEN** ese resultado se muestra normalmente

#### Scenario: Todos los resultados ya enlazados

- **WHEN** el modal de Link Discovery recibe resultados del backend
- **AND** todos los resultados tienen slugs que ya aparecen como wikilinks en la nota
- **THEN** el modal muestra el mensaje de "sin resultados"

#### Scenario: El filtro incluye cualquier punto del documento

- **WHEN** un wikilink `[[slug]]` existe en la sección de introducción, cuerpo, Related o cualquier otra sección de la nota
- **THEN** el resultado correspondiente queda excluido del modal, independientemente de en qué sección aparezca
