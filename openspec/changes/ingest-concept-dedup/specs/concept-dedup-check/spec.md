## MODIFIED Requirements

### Requirement: Los slugs de concepts siguen nomenclatura canónica
El sistema SHALL validar que el slug propuesto en `page_actions[].path` para concepts sea kebab-case, en inglés y en forma singular. Cuando el slug esté en plural y la forma singular sea derivable mediante heurística (eliminar sufijo `-s` o `-es` en palabras inglesas comunes), el sistema SHALL normalizar automáticamente el slug a singular y continuar con la acción normalizada. Solo cuando la normalización sea ambigua o incierta el sistema SHALL convertir la acción a `noop` y registrar una advertencia.

#### Scenario: Slug en plural derivable a singular
- **WHEN** el plan propone `wiki/concepts/mental-models.md`
- **THEN** el sistema normaliza automáticamente el slug a `mental-model`, continúa la resolución con el path corregido y registra un log de tipo `INFO` indicando la normalización aplicada

#### Scenario: Slug en plural ambiguo
- **WHEN** el plan propone `wiki/concepts/analyses.md` (plural irregular de "analysis")
- **THEN** el sistema no puede derivar la forma singular con certeza, convierte la acción en `noop` y registra una advertencia con el slug propuesto

#### Scenario: Slug correcto
- **WHEN** el plan propone `wiki/concepts/mental-model.md`
- **THEN** el sistema acepta el path sin modificación y procede con create o update según existencia del archivo
