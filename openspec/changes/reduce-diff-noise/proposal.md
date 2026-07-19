## Why

El método `splitLines` en `SnapshotService` usa `content.split("\n", -1)`, que preserva strings vacíos al final cuando el contenido termina en `\n` (lo cual es normal en archivos markdown). Esto produce líneas vacías espurias en el diff unificado que se muestran en la UI y ensucia el output.

## What Changes

- Corregir `splitLines` para que descarte elementos vacíos finales (cambiar `split("\n", -1)` a `split("\n", 0)` o equivalente).
- Normalizar saltos de línea `\r\n` → `\n` antes de dividir, para evitar ruido en archivos con line endings de Windows.
- Asegurar que el diff generado no tenga líneas en blanco extra al inicio o al final del output.

## Capabilities

### New Capabilities

- `clean-diff-output`: Generación de diffs unificados limpios, sin líneas vacías espurias ni ruido por line endings.

### Modified Capabilities

<!-- No existing spec-level behavior changes -->

## Impact

- `backend/src/main/java/com/dpswikillm/services/SnapshotService.java`: métodos `splitLines` y `buildUnifiedDiff`.
- `backend/src/test/java/com/dpswikillm/services/SnapshotServiceTests.java`: actualizar/añadir tests para el nuevo comportamiento.
- Sin cambios de API ni de base de datos.
