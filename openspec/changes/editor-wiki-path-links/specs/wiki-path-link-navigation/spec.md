## ADDED Requirements

### Requirement: Wikilinks con ruta de carpeta son resolubles
El sistema SHALL resolver wikilinks cuyo target incluya separadores de ruta (`/`) buscando por ruta completa del archivo (`node.data`), con o sin extensión `.md`, de forma case-insensitive.

#### Scenario: Clic en enlace con ruta completa navega al archivo correcto
- **WHEN** el usuario hace clic sobre `[[wiki/concepts/glutamina|glutamina]]` en el editor
- **THEN** el sistema navega al archivo cuya ruta completa es `wiki/concepts/glutamina.md`

#### Scenario: Enlace con ruta pero sin extensión .md también se resuelve
- **WHEN** el target del wikilink es `wiki/concepts/glutamina` (sin extensión)
- **THEN** el sistema encuentra el archivo `wiki/concepts/glutamina.md` correctamente

#### Scenario: Enlace con ruta inexistente muestra advertencia
- **WHEN** el usuario hace clic sobre un wikilink cuya ruta no corresponde a ningún archivo existente
- **THEN** el sistema muestra el toast de enlace roto existente (sin crash)

### Requirement: Los wikilinks simples siguen funcionando
El sistema SHALL continuar resolviendo wikilinks sin ruta (e.g. `[[glutamina|glutamina]]`) por nombre de archivo (label), manteniendo el comportamiento actual como fallback.

#### Scenario: Enlace simple sigue navegando por nombre de archivo
- **WHEN** el usuario hace clic sobre `[[glutamina|glutamina]]`
- **THEN** el sistema navega al archivo cuyo label sea `glutamina` o `glutamina.md`, igual que antes
