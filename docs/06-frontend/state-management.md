# Gestion de estado frontend

El frontend usa servicios con `signal`/`computed` para estado local de sesion, jobs y tema.

| Servicio | Estado |
|---|---|
| `AuthService` | JWT y usuario actual en `localStorage`, signals `token`, `currentUser`, `isLoggedIn`. |
| `JobsStore` | Lista de jobs y conexion SSE a `/api/jobs/events`. |
| `ThemeService` | Tema `light`/`dark` en `localStorage`. |
| `LoadingService` | Estado global de carga alimentado por `loadingInterceptor`. |
| `GlobalSearchService` | Seleccion de archivo desde modales/busqueda. |

Las llamadas HTTP funcionales viven principalmente en `ApiService`; las APIs de archivo se separan parcialmente en `FileService`.

Fuente: `frontend/src/app/services/*.ts`.

