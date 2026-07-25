## Context

El componente `explorer.component.ts` gestiona el modal de Link Discovery. Cuando el backend devuelve los resultados (`DiscoveredLink[]`), se asignan directamente a `linkDiscoveryResults` sin ningún filtrado. La nota actual está disponible en `this.currentMarkdown` (contenido editable sin frontmatter) y en `this.rawFileContent` (contenido completo con frontmatter).

Los wikilinks en el contenido de la nota tienen la forma `[[slug]]` donde `slug` es el nombre del fichero sin extensión `.md`. El método `slugFromPath(path)` ya existe para extraer el slug a partir de un path completo.

## Goals / Non-Goals

**Goals:**
- Ocultar del modal los resultados cuyo slug ya aparece como wikilink en cualquier punto del contenido de la nota abierta.
- Filtrado puramente en frontend, sin cambios en backend ni en API.

**Non-Goals:**
- Filtrar enlaces en formato markdown estándar `[texto](url)` — solo aplica a wikilinks `[[slug]]`.
- Filtrar basándose en el path completo o título (solo slug).
- Modificar el comportamiento del deduplicado al insertar en Related (ya existe y sigue igual).

## Decisions

### Dónde aplicar el filtro

**Decisión:** Filtrar en el handler del evento `done` dentro de `openLinkDiscovery()`, antes de llamar a `linkDiscoveryResults.set(...)`.

**Alternativa considerada:** Filtrar en un `computed()` sobre `linkDiscoveryResults`. Descartada porque añade complejidad reactiva innecesaria y el contenido de la nota no cambia mientras el modal está abierto.

**Rationale:** El filtrado al recibir resultados es el punto más simple y directo. El contenido en `this.currentMarkdown` es estable durante la sesión del modal.

### Fuente del contenido para extraer slugs existentes

**Decisión:** Usar `this.currentMarkdown` (sin frontmatter) para extraer los wikilinks existentes mediante la regex `/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g`.

**Rationale:** El frontmatter no contiene wikilinks relevantes. Usar `currentMarkdown` es consistente con la lógica de `addSelectedLinksToRelated` que ya usa la misma fuente y la misma regex.

## Risks / Trade-offs

- [Contenido modificado antes de abrir el modal] → El filtro usa `this.currentMarkdown` en el momento de abrir el modal, por lo que refleja los cambios no guardados. Comportamiento correcto.
- [Slug collision entre paths distintos] → Poco probable en el contexto del proyecto; no requiere mitigación.

## Migration Plan

Cambio de una sola línea lógica en el frontend. No requiere migración de datos ni despliegue coordinado con el backend.
