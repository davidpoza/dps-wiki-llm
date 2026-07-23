## Context

El proyecto ya dispone de un `GitService` que ejecuta comandos git sobre el vault mediante `ProcessBuilder`. Incluye `resetHard(String sha)` y la infraestructura para parsear salidas de proceso. No existe ningún endpoint REST ni componente Angular para exponer el historial de commits al usuario.

El vault git se gestiona en el servidor; el cliente Angular solo se comunica vía REST con el backend Spring Boot (contexto `/api`). Toda la API requiere JWT salvo las rutas en whitelist del `SecurityConfig`.

## Goals / Non-Goals

**Goals:**
- Añadir `GET /git/log` que devuelva los commits del repositorio con estadísticas de archivos (similar a `git log --stat`)
- Añadir `POST /git/reset` que ejecute `git reset --hard <sha>` sobre el vault
- Componente Angular `git-history` que muestre la lista de commits y permita hacer reset a uno seleccionado

**Non-Goals:**
- No se implementa `git revert` (solo `reset --hard`)
- No se soportan ramas; únicamente el historial lineal de `HEAD`
- No se implementa paginación avanzada en esta iteración (se limita a N commits recientes)
- No se implementa diff de contenido de archivos (solo stats: nombre + líneas +/-)

## Decisions

### 1. Reutilizar `GitService` en lugar de crear un nuevo servicio

`GitService` ya sabe cómo lanzar procesos git en el directorio correcto del vault. Añadir ahí `getLog()` mantiene toda la lógica git centralizada.

**Alternativa descartada**: Crear `GitHistoryService` independiente → duplicaría la infraestructura de `ProcessBuilder` y el `pathResolver`.

### 2. Parsear `git log` con formato porcelain (`--format=%H|%an|%ai|%s`)

Se usa un delimitador `|` en el formato para parsear campos fácilmente. Las estadísticas de archivos se obtienen añadiendo `--numstat` en lugar de `--stat` para tener valores numéricos directamente parseables (sin ancho de terminal variable).

**Alternativa descartada**: `--stat` con formato legible por humanos → frágil de parsear (depende del ancho de terminal, caracteres `+`/`-`).

**Formato elegido**:
```
git log --format=%H|%an|%ai|%s --numstat -n <limit>
```
Salida por commit: línea de metadatos + líneas `<added>\t<deleted>\t<path>` + línea vacía separadora.

### 3. `POST /git/reset` recibe el SHA completo

El cliente envía el SHA completo del commit al que hacer reset. El backend llama a `gitService.resetHard(sha)` que ya existe.

**Riesgo**: La operación es irreversible. Se mitiga requiriendo JWT (ya garantizado por `SecurityConfig`) y devolviendo el SHA resultante en la respuesta para que el cliente confirme.

### 4. Nuevo `GitController` (no ampliar `FileController` ni `JobController`)

Mantiene separación de responsabilidades. El contexto git es distinto al de archivos individuales o jobs de ingesta.

### 5. Componente Angular sin routing dedicado (acceso desde home)

Se añade un botón/tab en `home.component` que muestra/oculta `git-history.component` en la misma pantalla, sin crear una nueva ruta. Consistente con el patrón existente (ingest, review, etc. son tabs en home).

## Risks / Trade-offs

- [Reset destructivo] → Se muestra diálogo de confirmación en el frontend antes de ejecutar. El commit SHA se muestra en la confirmación para que el usuario sepa exactamente a qué punto revierte.
- [Repositorio grande con miles de commits] → El parámetro `limit` (por defecto 50) evita parsear historiales enormes. No es paginación real pero es suficiente para el caso de uso.
- [Concurrencia] → Si un job de ingesta hace commit mientras el usuario hace reset, puede haber inconsistencia. Es un riesgo aceptable en el contexto de un sistema mono-usuario/pequeño equipo.
