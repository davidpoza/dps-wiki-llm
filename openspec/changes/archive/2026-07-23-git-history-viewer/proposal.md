## Why

El proyecto gestiona archivos wiki mediante un repositorio git, pero no existe ninguna interfaz visual para inspeccionar el historial de commits ni para deshacer cambios. Esto obliga a los usuarios a usar la terminal para operaciones básicas de revisión y rollback.

## What Changes

- Nueva pantalla de historial git en el frontend Angular
- Nuevo endpoint REST en Spring Boot para listar commits con estadísticas de archivos (`git log --stat`)
- Nuevo endpoint REST para revertir el repositorio a un commit anterior (`git reset --hard <commit>`)

## Capabilities

### New Capabilities

- `git-history`: Visualización del historial de commits del repositorio con estadísticas por archivo (líneas añadidas/eliminadas). Permite seleccionar un commit y revertir el repositorio a ese punto mediante `git reset --hard`.

### Modified Capabilities

<!-- ninguna -->

## Impact

- **Backend**: Nuevo `GitController` con dos endpoints (`GET /api/git/log`, `POST /api/git/reset`). Requiere acceso al repositorio git del directorio de datos.
- **Frontend**: Nuevo componente `git-history.component.ts`. Nuevo ítem de navegación en la pantalla principal (`home.component`).
- **Seguridad**: El endpoint de reset es destructivo; debe requerir autenticación JWT.
- **Dependencias**: `JGit` (ya disponible en proyectos Spring) o ejecución de procesos git del sistema.
