## Context

El editor usa Milkdown con plugins ProseMirror propios. Los wikilinks renderizados llevan la clase CSS `wikilink-token` y se gestionan en `wikilink.plugin.ts`. El proyecto ya tiene:
- Menú contextual PrimeNG (`p-contextMenu`) usado en el árbol de archivos (`explorer.component.ts`).
- Modales PrimeNG (`p-dialog`) usados en múltiples componentes.
- Un sistema de prompts configurables en BD (`llm_prompts`) con API REST (`PromptController`) y UI dinámica en `/settings` que carga todos los prompts sin necesidad de cambios cuando se añade uno nuevo.
- `LlmClient` + `PromptService` para llamadas LLM.
- La migración más reciente es V36.

## Goals / Non-Goals

**Goals:**
- Menú contextual (clic derecho) sobre wikilinks renderizados con opción "Explicar enlace".
- Modal que muestra la justificación LLM de por qué las dos notas están enlazadas.
- Nuevo prompt `link-explain-system` en BD, configurable desde `/settings` sin cambios en el frontend de settings.
- Endpoint `POST /api/notes/explain-link` que orquesta la llamada al LLM.

**Non-Goals:**
- Soportar el menú contextual en texto libre (no-wikilinks).
- Streaming de la respuesta LLM (se muestra cuando completa).
- Caché de explicaciones.
- Modificar el sistema de navegación de wikilinks existente.

## Decisions

### D1: Captura del evento contextmenu en el plugin ProseMirror

El plugin `wikilink.plugin.ts` ya usa `handleClick`; se añade `handleDOMEvents: { contextmenu }` para interceptar el clic derecho sobre `.wikilink-token` y extraer el target del wikilink.

**Alternativa descartada**: escuchar el evento en el host del componente `explorer.component.ts` con `(contextmenu)`. Requeriría re-parsear el DOM para saber si estamos sobre un wikilink, y acopla la lógica de wikilinks al componente.

El plugin llamará un callback `onContextMenu(target: string, event: MouseEvent)` que el componente bindeará. El componente suprimirá el menú nativo (`event.preventDefault()`).

### D2: Menú contextual personalizado en lugar de `p-contextMenu` de PrimeNG

Se usa un div flotante posicionado absolutamente (mismo patrón que el dropdown de autocomplete de wikilinks ya existente en `explorer.component.ts`). Esto permite un menú mínimo de un solo ítem sin sobreingeniería, y el styling es consistente con el resto del editor.

**Alternativa descartada**: reutilizar `p-contextMenu`. Requiere `ViewChild` + `show(event)` + integrarlo en el árbol de árbol de archivos. El div simple es más limpio para este caso de un único ítem.

### D3: Modal con `p-dialog` de PrimeNG

Consistent con el resto de modales de la app (`broken-links-modal`, `concept-dedup-modal`, etc.). El contenido LLM se renderiza como texto plano (con `white-space: pre-wrap`).

### D4: Respuesta LLM síncrona en el endpoint

El endpoint `POST /api/notes/explain-link` llama al LLM de forma síncrona y devuelve la respuesta en el body. La explicación suele ser breve (2-5 frases), por lo que el tiempo de respuesta es aceptable sin streaming.

**Alternativa descartada**: enqueue de job async. La UX sería mucho más compleja (polling/redirección a jobs) para lo que es una consulta puntual y ligera.

### D5: Lectura de archivos en el backend

El backend lee el contenido de ambas notas desde el vault (filesystem) usando `VaultPathResolver`, igual que otros servicios. El prompt incluye: nombre de ambas notas, contenido completo de ambas (truncado si muy largo), y pide al LLM que justifique la relación.

## Risks / Trade-offs

- **[Riesgo] Notas muy largas** → El prompt puede superar el contexto del LLM. Mitigación: truncar cada nota a 3000 caracteres antes de incluirla en el prompt.
- **[Riesgo] Nota destino no encontrada** (wikilink roto) → El endpoint devuelve 404. El modal muestra un mensaje de error genérico. No bloquea al usuario.
- **[Riesgo] El menú contextual nativo del SO puede interferir** → Se llama `event.preventDefault()` en el callback para suprimirlo, pero algunos navegadores en ciertos contextos pueden ignorarlo. Es un edge case menor.

## Migration Plan

1. Migración Flyway `V37__link_explain_prompt.sql`: INSERT en `llm_prompts` con clave `link-explain-system`, nombre `"Explicar enlace entre notas"` y prompt inicial.
2. No hay rollback de datos necesario (la fila puede eliminarse manualmente si se revierte).
3. El prompt aparece automáticamente en `/settings` sin cambio de frontend.
