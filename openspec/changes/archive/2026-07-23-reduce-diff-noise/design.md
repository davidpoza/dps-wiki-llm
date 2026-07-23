## Context

`SnapshotService.buildUnifiedDiff` genera diffs unificados usando `java-diff-utils`. El método auxiliar `splitLines` divide el contenido por `\n` usando `split("\n", -1)`, que con el límite `-1` conserva strings vacíos finales. La mayoría de los archivos markdown terminan en `\n`, por lo que cada archivo produce un elemento `""` extra al final de la lista de líneas. Este elemento vacío se propaga al diff y aparece como líneas de contexto o cambios vacíos espurios en el output.

Estado actual en `SnapshotService.java`:
```java
private List<String> splitLines(String content) {
    if (content == null || content.isEmpty()) {
        return List.of();
    }
    return Arrays.asList(content.split("\n", -1));  // conserva "" final
}
```

## Goals / Non-Goals

**Goals:**
- Eliminar líneas vacías espurias al final del diff causadas por el trailing newline de los archivos.
- Normalizar `\r\n` → `\n` antes de dividir, para evitar ruido en archivos con line endings de Windows.
- El diff resultante no debe tener líneas en blanco extra al principio ni al final.

**Non-Goals:**
- No cambiar el formato del diff (sigue siendo unified diff estándar).
- No cambiar la API REST ni el esquema de base de datos.
- No modificar el contenido almacenado en `SnapshotFile` (solo afecta al cálculo del diff).

## Decisions

### 1. Cambiar `split("\n", -1)` a `split("\n", 0)`

`split("\n", 0)` (o simplemente `split("\n")`) descarta elementos vacíos finales, que es el comportamiento correcto para archivos de texto que terminan en newline.

**Alternativas consideradas:**
- Usar `split("\n", -1)` y luego eliminar manualmente el `""` final: más código, mismo resultado.
- Hacer `content.stripTrailing()` antes de dividir: correcto para trailing newlines, pero eliminaría espacios/tabs finales significativos si los hubiera (poco probable en markdown, pero menos preciso).

### 2. Normalizar `\r\n` → `\n` antes de dividir

Archivos editados en Windows pueden tener CRLF. Sin normalización, cada línea tendría un `\r` al final que aparece en el diff como ruido.

```java
content = content.replace("\r\n", "\n").replace("\r", "\n");
```

**Alternativas consideradas:**
- Solo `replace("\r\n", "\n")`: no cubre Mac Classic (`\r` suelto), aunque es raro.

### 3. Sin cambio en `String.join("\n", diff)`

El join actual es correcto: las líneas del diff generado por `UnifiedDiffUtils` no incluyen el `\n` como parte del string de cada línea, por lo que `join("\n", ...)` produce el output esperado.

## Risks / Trade-offs

- [Riesgo] Cambiar el comportamiento de `diffStats` también: al usar el mismo `splitLines`, el conteo de líneas añadidas/eliminadas cambiará ligeramente para archivos que solo difieren en trailing newlines. → Mitigación: Este es el comportamiento correcto; un trailing newline no debería contar como cambio de contenido.
- [Riesgo] Tests existentes pueden fallar si asumen el comportamiento antiguo con `-1`. → Mitigación: Actualizar los tests para reflejar el nuevo comportamiento limpio.

## Migration Plan

- Solo cambio de código en `SnapshotService`. No hay migración de datos ni de API.
- Los diffs ya almacenados en historial no se ven afectados (no se persisten en DB, se calculan on-demand).
- Deploy: reemplazar y desplegar normalmente.
