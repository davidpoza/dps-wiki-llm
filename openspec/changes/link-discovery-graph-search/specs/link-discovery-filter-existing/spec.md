## MODIFIED Requirements

### Requirement: Filtrado de enlaces ya presentes en la nota

Link Discovery SHALL excluir de sus resultados cualquier resultado cuyo path de destino ya esté enlazado desde la nota actualmente abierta, en cualquier parte de su contenido. La exclusión SHALL basarse en el **path de destino resuelto** de cada wikilink de la nota (usando el índice de slugs del vault), no en la igualdad literal del nombre de archivo, de modo que un enlace existente escrito con distinto uso de mayúsculas (`[[Krebs-Cycle]]`), como ruta completa (`[[wiki/concepts/krebs-cycle]]`) o con alias (`[[krebs-cycle|texto]]`) también excluya su resultado correspondiente. La exclusión SHALL aplicarse de forma autoritativa en el backend antes de devolver los resultados, y SHALL aplicarse tanto al modo Semantic como al modo Graph.

#### Scenario: Resultado ya enlazado queda oculto

- **WHEN** Link Discovery produce resultados para la nota abierta
- **AND** uno o más resultados tienen un path que ya aparece enlazado como `[[slug]]` en el contenido de la nota
- **THEN** esos resultados no se incluyen en la respuesta ni se muestran en el modal

#### Scenario: Resultado no enlazado sí se muestra

- **WHEN** Link Discovery produce resultados para la nota abierta
- **AND** un resultado tiene un path que no aparece enlazado en el contenido de la nota
- **THEN** ese resultado se muestra normalmente

#### Scenario: Coincidencia insensible a mayúsculas, ruta y alias

- **WHEN** la nota contiene el enlace existente `[[Krebs-Cycle]]`, `[[wiki/concepts/krebs-cycle]]` o `[[krebs-cycle|el ciclo del ácido cítrico]]`
- **AND** un resultado resuelve al mismo path de destino que ese enlace
- **THEN** ese resultado queda excluido, pese a las diferencias de mayúsculas, ruta o alias

#### Scenario: El filtro incluye cualquier punto del documento

- **WHEN** un wikilink existente aparece en la introducción, el cuerpo, la sección Related o cualquier otra parte de la nota
- **THEN** el resultado correspondiente queda excluido, independientemente de en qué sección aparezca

#### Scenario: La exclusión aplica en ambos modos

- **WHEN** el usuario ejecuta Link Discovery en modo Semantic o en modo Graph
- **THEN** los resultados de ese modo excluyen los paths ya enlazados desde la nota

#### Scenario: Todos los resultados ya enlazados

- **WHEN** todos los resultados producidos resuelven a paths que ya están enlazados en la nota
- **THEN** el modal muestra el mensaje de "sin resultados"
