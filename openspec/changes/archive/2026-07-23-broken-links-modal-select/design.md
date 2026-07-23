## Context

El modal de descubrimiento de enlaces (`linkDiscovery`) en `ExplorerComponent` muestra una lista de `DiscoveredLink[]` (path, title, docType, score) obtenida vía SSE. Actualmente cada ítem es un div clicable que navega al fichero. Los documentos tienen una sección `## Related` con wikilinks en formato `- [[slug]]`.

El componente ya gestiona el guardado de contenido markdown a través de `fileService.saveContent()`. El `currentMarkdown` del editor es el body del fichero sin el frontmatter YAML.

## Goals / Non-Goals

**Goals:**
- Añadir checkboxes a los ítems de resultado del modal de link discovery
- Botón "Añadir a Related" en el footer del modal (deshabilitado si no hay selección)
- Al confirmar, insertar los enlaces seleccionados en la sección `## Related` del documento, sin duplicados, y guardar
- Seleccionar todos / deseleccionar todos

**Non-Goals:**
- Cambios en el backend
- Modificar el comportamiento de navegación al hacer clic en un resultado (se elimina — los checkboxes reemplazan esa interacción)
- Soporte para formatos de enlace distintos a wikilinks (`[[slug]]`)

## Decisions

### D1: Inserción puramente frontend sin endpoint nuevo

La sección `## Related` se parsea y modifica en el frontend manipulando `currentMarkdown`. Esto evita añadir complejidad al backend para un caso de uso puntual que ya dispone de toda la información necesaria en el cliente.

Alternativa rechazada: endpoint `POST /jobs/add-related-links` que reciba path + slugs. Innecesario dado que el save ya existe.

### D2: El slug del wikilink se deriva del `path` de DiscoveredLink

El `path` que devuelve el backend es la ruta relativa dentro del vault (ej. `wiki/entities/My Note.md`). El slug del wikilink se obtiene quitando la extensión y la carpeta base según el formato `[[nombre-sin-extension]]`. Se usará solo el nombre de fichero sin carpeta ni extensión, que es la convención existente en la sección Related (visible en `BrokenLinkScanService`).

### D3: Estado de selección como `signal<Set<string>>`

Se añade `linkDiscoverySelected = signal<Set<string>>(new Set())` en `ExplorerComponent`. La clave es el `path` del enlace. Se resetea al abrir el modal.

### D4: Inserción en Related

Algoritmo para `addSelectedToRelated()`:
1. Buscar `## Related` en `currentMarkdown`
2. Si no existe, añadir la sección al final
3. Parsear las líneas existentes para extraer slugs ya presentes (evitar duplicados)
4. Añadir las líneas nuevas `- [[slug]]` al bloque
5. Llamar a `save()` tras actualizar `currentMarkdown`

## Risks / Trade-offs

- [Formato de slug] Si el título del fichero contiene caracteres especiales, el wikilink podría no resolverse. Mitigación: usar el mismo patrón que el sistema ya genera (`BrokenLinkScanService` extrae slugs de la misma forma).
- [Sección Related ausente] Si el documento no tiene sección `## Related`, se añade al final. Esto puede no respetar el orden canónico de secciones (Summary, Facts, Interpretation, Relationships, Related, Sources, Open Questions). Mitigación: insertar antes de `## Sources` si existe, o al final si no.
