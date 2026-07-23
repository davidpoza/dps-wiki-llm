## 1. Backend — DTOs y extensión de GitService

- [x] 1.1 Crear `CommitFileStatDto` record con campos `path`, `added`, `deleted`
- [x] 1.2 Crear `CommitDto` record con campos `sha`, `author`, `date`, `message`, `files` (List<CommitFileStatDto>)
- [x] 1.3 Añadir método `getLog(int limit)` en `GitService` que ejecute `git log --format=%H|%an|%ai|%s --numstat -n <limit>` y parsee la salida a `List<CommitDto>`

## 2. Backend — GitController

- [x] 2.1 Crear `GitController` con `GET /git/log?limit=50` que llame a `gitService.getLog(limit)` y devuelva `List<CommitDto>`
- [x] 2.2 Añadir `POST /git/reset` en `GitController` que reciba `{"sha": "..."}`, llame a `gitService.resetHard(sha)` y devuelva el SHA resultante de HEAD
- [x] 2.3 Añadir manejo de errores en `GitController`: IllegalArgumentException → 400, IllegalStateException → 500

## 3. Frontend — Modelo y servicio

- [x] 3.1 Añadir interfaces `CommitFileStat` y `Commit` a `types.ts` (o un archivo de tipos nuevo)
- [x] 3.2 Añadir métodos `getGitLog(limit?: number)` y `resetToCommit(sha: string)` en `api.service.ts`

## 4. Frontend — Componente git-history

- [x] 4.1 Crear `git-history.component.ts` con template inline que liste commits usando `@for`
- [x] 4.2 Mostrar por cada commit: SHA abreviado (7 chars), autor, fecha formateada, mensaje y stats de archivos (nombre, +added/-deleted)
- [x] 4.3 Añadir botón "Revertir a este commit" por cada commit con diálogo de confirmación nativo (`window.confirm`) mostrando SHA y mensaje
- [x] 4.4 Implementar lógica de reset: llamar a `apiService.resetToCommit(sha)`, recargar historial al éxito, mostrar error en caso de fallo

## 5. Frontend — Integración en home

- [x] 5.1 Añadir tab/botón "Historial Git" en `home.component.ts` siguiendo el patrón de los tabs existentes
- [x] 5.2 Incluir `<app-git-history>` en el template de `home.component` con `@if` condicionado al tab activo
- [x] 5.3 Registrar `GitHistoryComponent` como standalone import en `home.component` (o en el módulo si aplica)

## 6. Verificación

- [x] 6.1 Verificar que `GET /api/git/log` devuelve commits con stats correctos en el vault local
- [x] 6.2 Verificar que `POST /api/git/reset` con SHA válido revierte el repositorio correctamente
- [x] 6.3 Verificar en la UI que el historial se muestra y el flujo de confirmación/reset funciona end-to-end
