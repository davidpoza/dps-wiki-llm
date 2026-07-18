## Context

`HomeComponent` gestiona el tab activo con una signal interna `activeTab = signal<Tab>('jobs')`. Las rutas actuales en `main.ts` tienen una única entrada `{ path: '' }` para toda la pantalla principal. No hay sincronización entre tab y URL.

Tabs existentes: `jobs`, `ingest`, `chat`, `review`, `git`.

Esta pantalla ya usa Angular Router (importa `Router` para navegar al explorador), por lo que el patrón a seguir es el mismo que el introducido en `frontend-explorer-routing`.

## Goals / Non-Goals

**Goals:**
- Cada tab tiene su propia ruta de nivel superior: `/jobs`, `/ingest`, `/chat`, `/review`, `/git`.
- `/` redirige a `/jobs`.
- El tab activo se lee de la URL al cargar el componente.
- Cambiar de tab navega a la URL correspondiente; el historial del navegador funciona.

**Non-Goals:**
- Lazy loading de los componentes de cada tab (todos ya están eager-loaded).
- Proteger tabs individuales con guards distintos (todos requieren `authGuard`).
- Cambiar la estructura visual de los tabs.

## Decisions

### D1 — Rutas de nivel superior, un componente único

**Elegido**: cinco rutas de nivel superior (`/jobs`, `/ingest`, `/chat`, `/review`, `/git`) apuntando todas a `HomeComponent` + redirección `{ path: '', redirectTo: 'jobs', pathMatch: 'full' }`.

`HomeComponent` lee el tab activo del último segmento de la URL (`route.snapshot.url[0]?.path`). Al cambiar de tab, navega a la nueva ruta con `router.navigate([tabId])`.

**Alternativa descartada**: rutas hijas (`{ path: '', component: HomeComponent, children: [...] }`). Requeriría un `<router-outlet>` secundario dentro de `HomeComponent` y refactorizar cada tab como componente de ruta independiente — trabajo innecesario dado que los componentes de tab ya existen y se renderizan con `@switch`.

### D2 — Reutilización del componente sin recreación

Todas las rutas de tab (`/jobs`, `/ingest`, …) apuntan al mismo componente. Cuando el usuario cambia de tab, Angular detecta que es el mismo componente y lo reutiliza (no lo destruye). `HomeComponent` suscribe `route.url` para reaccionar al cambio de segmento y actualizar `activeTab`.

**Alternativa descartada**: leer `router.url` en un handler de `NavigationEnd`. Más frágil que `ActivatedRoute.url` y crea acoplamiento al formato de la URL.

### D3 — `pathMatch: 'full'` en la redirección de `/`

La redirección `{ path: '', redirectTo: 'jobs', pathMatch: 'full' }` garantiza que solo el path vacío exacto redirige a `/jobs`. Rutas desconocidas (p. ej. `/foo`) no se ven afectadas (ya existe un guard implícito).

## Risks / Trade-offs

- **Bookmarks rotos**: usuarios que tengan guardado `/` seguirán funcionando (redirige a `/jobs`). No hay URLs que se eliminen.
- **Recreación entre tabs y otras rutas**: al navegar de `/jobs` a `/explorer` y volver a `/jobs`, `HomeComponent` se recrea y el tab vuelve a `jobs` (el del segmento de la URL). Esto es correcto por diseño.
- **`canDeactivate` no aplica**: `HomeComponent` no tiene guard de salida — ningún tab genera estado sin guardar. Sin riesgo.

## Migration Plan

1. Actualizar `main.ts`: añadir redirección y cinco rutas de tab; eliminar la ruta `{ path: '' }`.
2. Actualizar `HomeComponent`: inyectar `ActivatedRoute`, suscribir `route.url`, navegar al cambiar tab.
3. Sin cambios en backend ni en otros componentes.

Rollback: revertir `main.ts` y `home.component.ts`.
