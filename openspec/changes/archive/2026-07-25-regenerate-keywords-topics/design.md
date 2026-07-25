## Context

El botón "Regenerar keywords" y el modal de selección en Configuración tienen una lista fija de carpetas elegibles (`wiki/concepts`, `wiki/sources`). Cualquier nota bajo `wiki/` es procesable por el job `REGENERATE_KEYWORDS`, por lo que la restricción debe eliminarse y simplificarse a un único prefijo `wiki/`.

Los dos puntos de cambio son:
1. `isKeywordEligible` en `explorer.component.ts` — computed signal que controla la visibilidad del botón en la barra de herramientas.
2. `keyword-selection-modal.component.ts` — lógica que carga la lista de notas para el modal de Configuración (actualmente llama a `listNotes(['wiki/concepts', 'wiki/sources'])`).

## Goals / Non-Goals

**Goals:**
- El botón "Regenerar keywords" aparece en la barra de herramientas al abrir cualquier nota bajo `wiki/`.
- El modal de selección en Configuración muestra todas las notas bajo `wiki/`.

**Non-Goals:**
- No se modifica el backend ni el job `REGENERATE_KEYWORDS` (ya soporta cualquier ruta).
- No se añade soporte para carpetas fuera de `wiki/` (e.g., `attachments/`).

## Decisions

**Usar `path.startsWith('wiki/')` en lugar de enumerar subcarpetas**: Más simple y robusto ante nuevas subcarpetas bajo `wiki/`. Alternativa descartada: seguir enumerando subcarpetas explícitamente — requiere cambio de código cada vez que se añade una nueva carpeta bajo `wiki/`.

**`listNotes(['wiki'])` o equivalente para el modal**: En lugar de pasar múltiples prefijos, se pasa un único prefijo `wiki` (o `wiki/`) para obtener todas las notas bajo esa ruta de una sola llamada. Requiere verificar que la API `/api/notes/list` acepta el prefijo `wiki` sin subcarpeta específica.

## Risks / Trade-offs

- [Notas sin keywords en frontmatter] → El job `REGENERATE_KEYWORDS` ya maneja este caso generando y guardando keywords nuevas. Sin mitigación adicional.
- [Modal con lista más larga] → La búsqueda client-side del modal ya gestiona listas grandes. Sin impacto en rendimiento.
