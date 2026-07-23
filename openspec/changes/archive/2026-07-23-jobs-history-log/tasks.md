## 1. Backend: DTO y Repository

- [x] 1.1 Crear `JobSummary` DTO en `com.dpswikillm.dto` con campos: `id`, `type`, `status`, `createdAt`, `completedAt`, `error`
- [x] 1.2 Añadir método `findTop50ByOrderByCreatedAtDesc()` en `JobRepository`

## 2. Backend: Endpoint GET /jobs

- [x] 2.1 Añadir `GET /jobs` en `JobController` que devuelva `List<JobSummary>` usando el nuevo método del repository
- [x] 2.2 Mapear entidad `Job` → `JobSummary` en el controller (o en un mapper simple)

## 3. Frontend: Tipo y servicio

- [x] 3.1 Añadir `createdAt?: string` y `completedAt?: string` al tipo `JobState` en `types.ts`
- [x] 3.2 Añadir `getJobs(): Observable<JobSummary[]>` en `ApiService` con llamada a `GET /api/jobs`

## 4. Frontend: JobsStore carga historial al iniciar

- [x] 4.1 En `JobsStore.connect()`, llamar a `api.getJobs()` y popular el mapa con los jobs devueltos antes de abrir el EventSource
- [x] 4.2 Asegurar que `handleEvent()` actualiza (no duplica) jobs ya presentes en el mapa

## 5. Frontend: Mostrar timestamp en JobsViewerComponent

- [x] 5.1 Añadir pipe `DatePipe` o formateo inline para mostrar `createdAt` en cada job card
- [x] 5.2 Mostrar el timestamp solo si `createdAt` está presente (campo opcional)
