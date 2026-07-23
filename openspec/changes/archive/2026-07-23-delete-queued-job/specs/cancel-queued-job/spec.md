## ADDED Requirements

### Requirement: Estado CANCELLED en el ciclo de vida del job
El sistema SHALL incluir el estado `CANCELLED` en el enum `JobStatus`. Un job CANCELLED representa un job que fue interrumpido intencionalmente por el usuario antes de comenzar su ejecución.

#### Scenario: El estado CANCELLED existe en el enum
- **WHEN** el sistema arranca
- **THEN** `JobStatus.CANCELLED` está disponible como valor válido

---

### Requirement: Endpoint REST para cancelar un job en estado QUEUED
El sistema SHALL exponer `DELETE /jobs/{id}` que transiciona el job al estado CANCELLED y emite un evento SSE, solo si el job está en estado QUEUED.

#### Scenario: Cancelación exitosa de job QUEUED
- **WHEN** el cliente llama `DELETE /jobs/{id}` y el job con ese id existe y tiene estado QUEUED
- **THEN** el job transiciona a estado CANCELLED, se emite un SSE con el nuevo estado y se retorna HTTP 204

#### Scenario: Intento de cancelar job que no está QUEUED
- **WHEN** el cliente llama `DELETE /jobs/{id}` y el job existe pero tiene un estado diferente a QUEUED
- **THEN** el sistema retorna HTTP 409 Conflict

#### Scenario: Intento de cancelar job inexistente
- **WHEN** el cliente llama `DELETE /jobs/{id}` y no existe ningún job con ese id
- **THEN** el sistema retorna HTTP 404 Not Found

---

### Requirement: El consumer ignora jobs en estado CANCELLED
El sistema SHALL verificar el estado del job al inicio de cada consumer listener. Si el job está en estado CANCELLED, el consumer SHALL retornar sin ejecutar el pipeline.

#### Scenario: Consumer recibe mensaje de job CANCELLED
- **WHEN** el consumer de RabbitMQ recibe un `JobMessage` y el job correspondiente tiene estado CANCELLED
- **THEN** el consumer no ejecuta ningún pipeline y no emite ningún evento de estado

#### Scenario: Consumer recibe mensaje de job QUEUED
- **WHEN** el consumer de RabbitMQ recibe un `JobMessage` y el job tiene estado QUEUED
- **THEN** el consumer procede con la ejecución normal del pipeline

---

### Requirement: Botón cancelar en el visor de jobs del frontend
La UI SHALL mostrar un botón "Cancelar" en cada job card cuyo estado sea QUEUED. Al pulsarlo, SHALL llamar a `DELETE /jobs/{id}` y reflejar el resultado en la UI.

#### Scenario: Botón visible para job QUEUED
- **WHEN** la lista de jobs se renderiza y existe un job con estado QUEUED
- **THEN** la job card muestra un botón de cancelar

#### Scenario: Botón no visible para jobs en otros estados
- **WHEN** la lista de jobs se renderiza y el job tiene estado distinto a QUEUED
- **THEN** la job card no muestra el botón de cancelar

#### Scenario: Usuario pulsa el botón cancelar
- **WHEN** el usuario pulsa el botón de cancelar en un job QUEUED
- **THEN** se llama `DELETE /jobs/{id}` y el job card refleja el estado CANCELLED al recibir el SSE

---

### Requirement: Estado CANCELLED visible en el frontend
La UI SHALL mostrar el estado CANCELLED con severidad `secondary` (etiqueta gris) en el tag de estado del job.

#### Scenario: Tag de estado para job CANCELLED
- **WHEN** un job tiene estado CANCELLED
- **THEN** el p-tag muestra "CANCELLED" con severidad `secondary`
