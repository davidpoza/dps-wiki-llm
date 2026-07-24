## ADDED Requirements

### Requirement: Atajo de teclado Ctrl+Shift+S para sincronización
El editor SHALL disparar la sincronización WebDAV manual cuando el usuario pulsa `Ctrl+Shift+S`, de forma equivalente a pulsar el botón de sync en la toolbar. El atajo SHALL estar activo siempre que el componente explorer esté montado, independientemente del foco actual.

#### Scenario: Sync disparado con Ctrl+Shift+S estando el editor activo
- **WHEN** el usuario pulsa `Ctrl+Shift+S` con el editor Markdown en foco
- **THEN** el sistema inicia la sincronización WebDAV (igual que al pulsar el botón de sync), previene el comportamiento predeterminado del navegador, y el botón de sync muestra el estado de carga

#### Scenario: Ctrl+Shift+S mientras ya hay sync en curso
- **WHEN** el usuario pulsa `Ctrl+Shift+S` y ya hay una sincronización en progreso
- **THEN** el sistema no lanza una segunda sincronización (la guarda del guard `if (this.syncing()) return`)
