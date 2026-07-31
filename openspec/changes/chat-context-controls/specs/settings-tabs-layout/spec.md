## MODIFIED Requirements

### Requirement: Settings organizada en tabs Prompts y Datos
La pantalla de Settings SHALL mostrar tres tabs diferenciadas: "Datos", "Prompts" y "Chat", usando el componente `p-tabs` de PrimeNG. La tab activa por defecto SHALL ser "Datos". La tab "Chat" SHALL contener la configuración del contexto del chat (recuperación, expansión por enlaces y presupuesto de contexto).

#### Scenario: Visualización inicial con tab Datos activa
- **WHEN** el usuario navega a la pantalla de Settings
- **THEN** se muestra el componente de tabs con "Datos" seleccionada por defecto, mostrando las secciones: Apariencia, Índice del Vault, Keywords, Health Check, Recursos, Mantenimiento y Broken Links

#### Scenario: Cambio a tab Prompts
- **WHEN** el usuario pulsa la tab "Prompts"
- **THEN** la tab activa cambia a "Prompts" y se muestra únicamente la sección "Prompts del LLM" con sus textareas y botones de guardar

#### Scenario: Cambio a tab Chat
- **WHEN** el usuario pulsa la tab "Chat"
- **THEN** la tab activa cambia a "Chat" y se muestra la configuración del contexto del chat con sus controles y botones de guardar

#### Scenario: Footer de versión visible en tab Datos
- **WHEN** el usuario está en la tab "Datos" y hace scroll hasta el final
- **THEN** se muestra el footer con las versiones de frontend y backend
