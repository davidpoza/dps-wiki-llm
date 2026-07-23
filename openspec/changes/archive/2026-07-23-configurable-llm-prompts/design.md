## Context

La aplicación tiene tres prompts LLM hardcodeados en servicios Java:

| Servicio | Clave | Uso |
|---|---|---|
| `SourceNoteLlmService` | `source-note-system` | Prompt de sistema para extraer nota de fuente en JSON |
| `LlmMutationPlanService` | `mutation-plan-system` | Prompt de sistema para generar plan de mutación JSON |
| `AnswerPipelineService` | `answer-system` | Prompt de sistema para responder preguntas con contexto |

El stack es Spring Boot 3 + PostgreSQL (con Flyway) en el backend y Angular en el frontend. Ya existe autenticación JWT. No hay pantalla de configuración en la UI todavía.

## Goals / Non-Goals

**Goals:**
- Mover los tres prompts a BD, editables desde la UI sin restart.
- Pantalla `/settings` en Angular con formulario de prompts.
- Caché en memoria de los prompts para no penalizar el rendimiento de cada llamada LLM.

**Non-Goals:**
- Versionado o historial de cambios de prompts.
- Permisos granulares por rol (basta con autenticación JWT).
- Creación o borrado de prompts desde la UI (solo edición de los existentes).
- Internacionalización de la pantalla de settings.

## Decisions

### D1: Tabla `llm_prompts` con clave de texto

Se usa una clave `VARCHAR` legible (ej. `source-note-system`) en lugar de UUID, ya que los servicios referencian prompts por nombre semántico. Alternativa descartada: enum en código → obliga a redeployar igualmente al añadir prompts.

**Schema:**
```sql
CREATE TABLE llm_prompts (
    key        VARCHAR(100) PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    text       TEXT         NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

### D2: `PromptService` con caché en memoria simple (Map + lock)

Un `HashMap<String, String>` cargado al arranque y limpiado al hacer `PUT`. No se usa Spring Cache ni Caffeine para no añadir dependencias. La caché se invalida completamente en cada escritura (los tres prompts son pocos y pequeños).

Alternativa: recargar siempre de BD → latencia añadida en cada llamada LLM (inaceptable para pipelines de ingesta que llaman repetidamente).

### D3: Endpoint `PUT` solo actualiza texto (no crea ni borra)

Las claves son conocidas y fijas en el código (los servicios las referencian hardcodeadas como constantes). Crear desde la UI sin tocar el código no aportaría valor. Si en el futuro se añade un nuevo servicio LLM, se crea via migración Flyway.

### D4: Pantalla de settings como componente Angular standalone

Se añade `settings.component.ts` con formulario reactivo. Cada prompt tiene su propio botón "Guardar" para no obligar al usuario a guardar todos de golpe. La ruta `/settings` se añade al `app.component.ts` (o al módulo de rutas existente) protegida con `AuthGuard`.

### D5: Migración Flyway V8 inserta datos iniciales

La migración crea la tabla E inserta los tres prompts con sus textos actuales. Así el sistema arranca funcional sin intervención manual.

## Risks / Trade-offs

- **Caché inconsistente en multi-instancia** → En el despliegue actual hay una sola instancia; si se escala horizontalmente, la caché de las otras instancias quedará stale hasta restart. Mitigación futura: TTL corto o invalidación vía Redis. Por ahora es aceptable.
- **Prompt corrupto por edición errónea** → Un usuario puede romper el formato JSON esperado por el LLM. Mitigación: documentar en la UI que el prompt debe incluir las instrucciones JSON; no hay validación automática del texto.
- **Sin auditoría de cambios** → No se guarda quién cambió qué. Aceptable en la fase actual; se puede añadir en una iteración futura.

## Migration Plan

1. Aplicar migración Flyway V8 (crea tabla e inserta datos) — automático al arrancar.
2. Deployar backend con `PromptService`, `PromptController` y servicios refactorizados.
3. Deployar frontend con `SettingsComponent`.
4. Rollback: revertir al commit anterior; la tabla `llm_prompts` queda huérfana pero no causa error (los servicios volverían a usar los literales hardcodeados).

## Open Questions

_(ninguna — el alcance está bien acotado)_
