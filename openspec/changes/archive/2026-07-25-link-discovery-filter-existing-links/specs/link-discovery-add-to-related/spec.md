## MODIFIED Requirements

### Requirement: Evitar duplicados

El sistema SHALL no añadir a la sección `## Related` ningún slug que ya exista como wikilink en cualquier parte del documento, y además SHALL no mostrar en el modal ningún resultado cuyo slug ya esté enlazado en cualquier punto del contenido de la nota.

#### Scenario: Evitar duplicados al insertar en Related

- **WHEN** un enlace seleccionado ya existe en la sección `## Related`
- **THEN** ese enlace no se añade de nuevo

#### Scenario: Modal no muestra enlaces ya presentes en la nota

- **WHEN** el modal de Link Discovery muestra resultados
- **THEN** no aparece ningún resultado cuyo slug ya esté presente como wikilink en cualquier parte del contenido de la nota
