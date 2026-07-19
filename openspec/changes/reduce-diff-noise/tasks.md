## 1. Fix splitLines in SnapshotService

- [x] 1.1 Cambiar `content.split("\n", -1)` a `content.split("\n", 0)` en `splitLines` para descartar strings vacíos finales
- [x] 1.2 Añadir normalización CRLF→LF (`content.replace("\r\n", "\n").replace("\r", "\n")`) dentro de `splitLines` antes de dividir

## 2. Verificar buildUnifiedDiff output

- [x] 2.1 Comprobar que el resultado de `String.join("\n", diff)` no genera líneas en blanco extra al inicio o al final y ajustar si es necesario

## 3. Actualizar y añadir tests

- [x] 3.1 Actualizar tests existentes en `SnapshotServiceTests` que usen `split("\n", -1)` para reflejar el nuevo comportamiento
- [x] 3.2 Añadir test: diff entre dos archivos con trailing `\n` no produce línea vacía espuria al final
- [x] 3.3 Añadir test: diff entre archivos con CRLF y LF muestra solo diferencias reales de contenido
- [x] 3.4 Añadir test: `diffStats` no cuenta el trailing newline como línea añadida/eliminada
