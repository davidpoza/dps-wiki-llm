## ADDED Requirements

### Requirement: Ctrl+P abre el modal de búsqueda desde cualquier ruta autenticada
El sistema SHALL abrir el modal de búsqueda de archivos al pulsar `Ctrl+P` en cualquier ruta autenticada de la aplicación, no solo desde la vista del editor markdown (`/explorer`).

#### Scenario: Abrir modal desde la pantalla de jobs
- **WHEN** el usuario está en la ruta `/jobs` y pulsa `Ctrl+P`
- **THEN** el modal de búsqueda de archivos se abre

#### Scenario: Abrir modal desde la pantalla de chat
- **WHEN** el usuario está en la ruta `/chat` y pulsa `Ctrl+P`
- **THEN** el modal de búsqueda de archivos se abre

#### Scenario: Abrir modal desde settings
- **WHEN** el usuario está en la ruta `/settings` y pulsa `Ctrl+P`
- **THEN** el modal de búsqueda de archivos se abre

#### Scenario: Abrir modal desde el explorer (comportamiento existente preservado)
- **WHEN** el usuario está en la ruta `/explorer` y pulsa `Ctrl+P`
- **THEN** el modal de búsqueda de archivos se abre

---

### Requirement: Seleccionar archivo navega al editor desde rutas no-explorer
El sistema SHALL navegar a la ruta `/explorer/<path>` cuando el usuario selecciona un archivo desde el modal de búsqueda y la ruta actual no es `/explorer/**`.

#### Scenario: Selección desde jobs navega al editor
- **WHEN** el usuario abre el modal desde `/jobs` y selecciona un archivo
- **THEN** la aplicación navega a `/explorer/<path-del-archivo>`

#### Scenario: Selección desde chat navega al editor
- **WHEN** el usuario abre el modal desde `/chat` y selecciona un archivo
- **THEN** la aplicación navega a `/explorer/<path-del-archivo>`

---

### Requirement: Seleccionar archivo desde explorer respeta cambios sin guardar
El sistema SHALL mostrar un diálogo de confirmación si el usuario selecciona un archivo desde el modal de búsqueda mientras está en el editor con cambios sin guardar.

#### Scenario: Confirmación de descarte de cambios
- **WHEN** el usuario está en `/explorer` con cambios sin guardar, abre el modal con `Ctrl+P` y selecciona un archivo diferente
- **THEN** se muestra un diálogo de confirmación antes de navegar al archivo seleccionado

#### Scenario: Navegación directa sin cambios pendientes
- **WHEN** el usuario está en `/explorer` sin cambios sin guardar y selecciona un archivo desde el modal
- **THEN** la aplicación navega directamente al archivo seleccionado sin diálogo de confirmación

---

### Requirement: El modal de búsqueda es funcional fuera del explorer
El sistema SHALL mostrar la lista completa de archivos del vault en el modal de búsqueda independientemente de la ruta desde la que se abre.

#### Scenario: Lista de archivos disponible desde jobs
- **WHEN** el usuario abre el modal desde `/jobs`
- **THEN** el modal muestra la lista de archivos del vault y permite filtrar por nombre

#### Scenario: Búsqueda por nombre funciona desde cualquier ruta
- **WHEN** el usuario escribe en el input de búsqueda del modal
- **THEN** la lista se filtra por las rutas de los archivos que contienen el texto introducido

---

### Requirement: Shortcut no interfiere con campos de texto activos
El sistema SHALL ignorar el shortcut `Ctrl+P` cuando el foco está en un campo de texto que tiene un comportamiento específico para esa combinación de teclas (ej. el editor CodeMirror).

#### Scenario: Ctrl+P no abre el modal dentro del editor CodeMirror
- **WHEN** el cursor está en el editor de texto CodeMirror y el usuario pulsa `Ctrl+P`
- **THEN** el modal de búsqueda NO se abre y el evento se procesa normalmente por el editor
