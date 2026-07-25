## ADDED Requirements

### Requirement: Endpoint REST para abandonar un job en estado PROGRESS o STARTED
El sistema SHALL exponer `POST /jobs/{id}/abandon` que transiciona el job al estado `FAILED` con mensaje de error `"Abandoned by user"` y emite un evento SSE, solo si el job está en estado `PROGRESS` o `STARTED`.

#### Scenario: Abandono exitoso de job en PROGRESS
- **WHEN** el cliente llama `POST /jobs/{id}/abandon` y el job existe y tiene estado `PROGRESS`
- **THEN** el job transiciona a estado `FAILED`, `error` se establece a `"Abandoned by user"`, se emite un SSE con el nuevo estado y se retorna HTTP 200

#### Scenario: Abandono exitoso de job en STARTED
- **WHEN** el cliente llama `POST /jobs/{id}/abandon` y el job existe y tiene estado `STARTED`
- **THEN** el job transiciona a estado `FAILED`, `error` se establece a `"Abandoned by user"`, se emite un SSE con el nuevo estado y se retorna HTTP 200

#### Scenario: Intento de abandonar job en estado no permitido
- **WHEN** el cliente llama `POST /jobs/{id}/abandon` y el job existe pero tiene un estado distinto a `PROGRESS` y `STARTED`
- **THEN** el sistema retorna HTTP 409 Conflict sin modificar el job

#### Scenario: Intento de abandonar job inexistente
- **WHEN** el cliente llama `POST /jobs/{id}/abandon` y no existe ningún job con ese id
- **THEN** el sistema retorna HTTP 404 Not Found

---

### Requirement: Método abandonJob en JobLifecycleService
El sistema SHALL implementar `abandonJob(UUID jobId)` en `JobLifecycleService` que transiciona el job a `FAILED` con el mensaje `"Abandoned by user"`, usando el mecanismo existente `transition()`, y que lanza `ResponseStatusException(CONFLICT)` si el job no está en `PROGRESS` ni `STARTED`.

#### Scenario: Estado válido — transición a FAILED
- **WHEN** se invoca `abandonJob(id)` y el job tiene estado `PROGRESS` o `STARTED`
- **THEN** el job queda en estado `FAILED` con `error = "Abandoned by user"` y se emite el evento SSE correspondiente

#### Scenario: Estado inválido — excepción CONFLICT
- **WHEN** se invoca `abandonJob(id)` y el job tiene un estado distinto a `PROGRESS` y `STARTED`
- **THEN** se lanza `ResponseStatusException` con código HTTP 409

---

### Requirement: Botón Abandonar en el visor de jobs del frontend
La UI SHALL mostrar un botón "Abandonar" en cada job card cuyo estado sea `PROGRESS` o `STARTED`. Al pulsarlo, SHALL llamar a `POST /jobs/{id}/abandon` y reflejar el resultado en la UI vía el canal SSE existente.

#### Scenario: Botón visible para job en PROGRESS
- **WHEN** la lista de jobs se renderiza y existe un job con estado `PROGRESS`
- **THEN** la job card muestra el botón de abandonar

#### Scenario: Botón visible para job en STARTED
- **WHEN** la lista de jobs se renderiza y existe un job con estado `STARTED`
- **THEN** la job card muestra el botón de abandonar

#### Scenario: Botón no visible para jobs en otros estados
- **WHEN** la lista de jobs se renderiza y el job tiene estado distinto a `PROGRESS` y `STARTED`
- **THEN** la job card no muestra el botón de abandonar

#### Scenario: Usuario pulsa el botón Abandonar
- **WHEN** el usuario pulsa el botón de abandonar en un job con estado `PROGRESS` o `STARTED`
- **THEN** se llama `POST /jobs/{id}/abandon` y la job card actualiza su estado a `FAILED` al recibir el SSE

---

### Requirement: Método abandonJob en ApiService del frontend
El servicio `ApiService` SHALL exponer un método `abandonJob(jobId: string): Observable<void>` que realiza `POST /jobs/{id}/abandon`.

#### Scenario: Llamada al endpoint de abandono
- **WHEN** se invoca `apiService.abandonJob(id)`
- **THEN** se realiza una petición HTTP POST a `/jobs/{id}/abandon`
