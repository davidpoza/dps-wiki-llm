## ADDED Requirements

### Requirement: Backend expone listado de jobs recientes
El sistema SHALL proveer un endpoint `GET /api/jobs` que devuelva los últimos 50 jobs ordenados por `created_at` descendente, incluyendo: id, type, status, createdAt, completedAt (nullable) y error (nullable).

#### Scenario: Listado básico
- **WHEN** el cliente hace `GET /api/jobs`
- **THEN** el servidor responde con HTTP 200 y un array JSON de hasta 50 objetos JobSummary, ordenados de más reciente a más antiguo

#### Scenario: Listado vacío
- **WHEN** no hay jobs en la base de datos
- **THEN** el servidor responde con HTTP 200 y un array vacío `[]`

#### Scenario: Acceso autenticado
- **WHEN** el cliente incluye un token JWT válido en la cabecera Authorization
- **THEN** el servidor responde normalmente con la lista de jobs

### Requirement: Frontend carga historial al inicializar el store
El `JobsStore` SHALL realizar una llamada HTTP a `GET /api/jobs` al ejecutar `connect()`, antes de abrir el EventSource, y popular el mapa de jobs con los resultados.

#### Scenario: Historial cargado al abrir el panel
- **WHEN** el usuario abre la pantalla de jobs (o la app inicializa)
- **THEN** se muestran todos los jobs recientes (hasta 50) con su estado final persisted en DB

#### Scenario: SSE enriquece un job del historial
- **WHEN** llega un evento SSE para un jobId que ya existe en el historial
- **THEN** el estado del job se actualiza con la información del evento sin duplicar la entrada

#### Scenario: Job nuevo vía SSE no presente en historial
- **WHEN** llega un evento SSE para un jobId que no estaba en el historial
- **THEN** se añade el job como una nueva entrada en el mapa

### Requirement: Pantalla de jobs muestra timestamp de creación
Cada job card en la pantalla de jobs SHALL mostrar la fecha y hora de creación del job en formato legible (e.g., `DD/MM/YYYY HH:mm`).

#### Scenario: Timestamp visible en job completado del historial
- **WHEN** se muestra un job con estado COMPLETED cargado desde el historial
- **THEN** la card muestra el timestamp `createdAt` del job

#### Scenario: Timestamp visible en job activo (SSE)
- **WHEN** se muestra un job activo recibido vía SSE que no tiene `createdAt` aún
- **THEN** la card no muestra timestamp (el campo es opcional en el frontend)
