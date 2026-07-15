## Context

Los jobs se gestionan con RabbitMQ. Al crear un job, se persiste en BD con estado QUEUED y se publica un mensaje en la cola. El consumer (`JobConsumers`) lee ese mensaje y ejecuta el pipeline. Actualmente no existe ningún mecanismo para cancelar un job antes de que empiece a ejecutarse.

El reto principal es la naturaleza asíncrona de RabbitMQ: el mensaje ya está en la cola cuando el usuario quiere cancelar, así que no basta con borrar el registro de BD — el consumer lo procesaría igualmente y fallaría con `orElseThrow()`.

## Goals / Non-Goals

**Goals:**
- Permitir al usuario cancelar un job en estado QUEUED desde la UI y la API.
- Garantizar que el consumer no procese un job cancelado.
- Reflejar el estado CANCELLED en el visor de jobs del frontend.

**Non-Goals:**
- Cancelar jobs en estado STARTED, PROGRESS o AWAITING_REVIEW (ya están en ejecución).
- Implementar purga de mensajes en RabbitMQ (innecesario con el enfoque elegido).
- Borrar físicamente el registro de BD del job cancelado.

## Decisions

### 1. Nuevo estado CANCELLED en lugar de borrado físico

**Decisión:** Añadir `CANCELLED` a `JobStatus` y transicionar el job a ese estado al cancelar.

**Alternativas consideradas:**
- *Borrado físico*: el consumer fallaría en `orElseThrow()` y el error sería silenciado por el catch, lo que mezcla cancelación con error. Poco claro en logs y UI.
- *Reutilizar FAILED*: semánticamente incorrecto; FAILED implica un fallo de ejecución, no una cancelación intencional.

**Rationale:** El estado CANCELLED es semánticamente preciso, observable en la UI y compatible con el modelo de ciclo de vida existente.

### 2. Guard en el consumer para saltar jobs CANCELLED

**Decisión:** En `JobConsumers`, antes de transicionar a STARTED, comprobar si el job es CANCELLED y retornar sin hacer nada.

**Alternativas consideradas:**
- *Eliminar el mensaje de RabbitMQ al cancelar*: requiere usar `RabbitAdmin` para purgar mensajes o implementar Dead Letter Exchange, añadiendo complejidad innecesaria.

**Rationale:** Un simple check en el consumer es la solución de menor coste y sin efectos secundarios.

### 3. Endpoint REST DELETE /jobs/{id}

**Decisión:** `DELETE /jobs/{id}` valida que el job esté en QUEUED y lo transiciona a CANCELLED emitiendo un SSE.

**Rationale:** La semántica DELETE es correcta para cancelar/eliminar un recurso. La validación del estado evita cancelaciones inválidas. El SSE mantiene la UI sincronizada en tiempo real.

## Risks / Trade-offs

- **Race condition:** el consumer puede leer el mensaje y hacer `transition(STARTED)` justo antes de que el DELETE llegue al backend. → El guard en el consumer no aplica, el job continúa. Es un window muy pequeño y aceptable para este caso de uso.
- **Migración de BD:** añadir el valor CANCELLED al enum requiere una migración Flyway. → Simple `ALTER TYPE` o gestión por `EnumType.STRING` (ya usado, Hibernate lo gestiona sin migración de tipo en PostgreSQL con `VARCHAR`).

## Migration Plan

1. Desplegar backend con nuevo endpoint y valor CANCELLED.
2. Desplegar frontend con botón de cancelar.
3. No se requiere rollback especial: jobs CANCELLED en BD no afectan a otros flujos.

## Open Questions

- ¿Debe eliminarse el botón de cancelar si el job lleva más de N segundos en QUEUED (alta probabilidad de race condition)? → Decisión deferida; inicialmente siempre visible.
