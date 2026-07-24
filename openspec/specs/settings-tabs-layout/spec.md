# settings-tabs-layout Specification

## Purpose
TBD - created by syncing change ui-scrollbar-and-settings-tabs.
## Requirements
### Requirement: Settings organizada en tabs Prompts y Datos
La pantalla de Settings SHALL mostrar dos tabs diferenciadas: "Prompts" y "Datos", usando el componente `p-tabs` de PrimeNG. La tab activa por defecto SHALL ser "Datos".

#### Scenario: Visualización inicial con tab Datos activa
- **WHEN** el usuario navega a la pantalla de Settings
- **THEN** se muestra el componente de tabs con "Datos" seleccionada por defecto, mostrando las secciones: Apariencia, Índice del Vault, Keywords, Health Check, Recursos, Mantenimiento y Broken Links

#### Scenario: Cambio a tab Prompts
- **WHEN** el usuario pulsa la tab "Prompts"
- **THEN** la tab activa cambia a "Prompts" y se muestra únicamente la sección "Prompts del LLM" con sus textareas y botones de guardar

#### Scenario: Footer de versión visible en tab Datos
- **WHEN** el usuario está en la tab "Datos" y hace scroll hasta el final
- **THEN** se muestra el footer con las versiones de frontend y backend
