## 1. Backend — Migración Flyway

- [x] 1.1 Crear `V37__link_explain_prompt.sql`: INSERT en `llm_prompts` con clave `link-explain-system`, nombre `"Explicar enlace entre notas"` y un prompt inicial que instruya al LLM a explicar por qué las dos notas proporcionadas están enlazadas.

## 2. Backend — Endpoint explain-link

- [x] 2.1 Crear `LinkExplainRequest` DTO con campos `sourcePath` y `targetPath` (Strings).
- [x] 2.2 Crear `LinkExplainResponse` DTO con campo `explanation` (String).
- [x] 2.3 Crear `LinkExplainService`: leer contenido de ambas notas vía `VaultPathResolver`, truncar a 3000 chars cada una, construir mensaje de usuario con ambos contenidos, llamar a `llmClient.chat()` usando `promptService.getText("link-explain-system")` como system message, devolver el texto de respuesta.
- [x] 2.4 Crear `LinkExplainController`: `POST /api/notes/explain-link`, requiere JWT, delega en `LinkExplainService`, devuelve 200 con `LinkExplainResponse` o 404 si alguna nota no existe.

## 3. Frontend — Plugin wikilink (contextmenu)

- [x] 3.1 Añadir callback `onContextMenu: (target: string, x: number, y: number) => void` a la interfaz `WikilinkPluginOptions` en `wikilink.plugin.ts`.
- [x] 3.2 Añadir `handleDOMEvents: { contextmenu: (view, event) => boolean }` al plugin: si el target tiene clase `wikilink-token`, extraer el target del wikilink, llamar `event.preventDefault()`, invocar `onContextMenu` con target y coordenadas, y devolver `true`; si no, devolver `false`.

## 4. Frontend — Menú contextual en el editor

- [x] 4.1 En `explorer.component.ts`, añadir signals: `wikilinkContextMenuVisible`, `wikilinkContextMenuX`, `wikilinkContextMenuY`, `wikilinkContextMenuTarget`.
- [x] 4.2 Bindear el callback `onContextMenu` del plugin wikilink para poblar esos signals y mostrar el menú.
- [x] 4.3 Añadir el div del menú contextual en el template de `explorer.component.ts` (posicionado absolutamente con `left/top` desde los signals), con la opción "Explicar enlace" y listener `(click)`.
- [x] 4.4 Cerrar el menú al hacer clic fuera (listener `document:click` o `clickOutside`) y al pulsar Escape.

## 5. Frontend — Servicio HTTP

- [x] 5.1 Crear (o ampliar el servicio existente) método `explainLink(sourcePath: string, targetPath: string): Observable<{ explanation: string }>` que llame a `POST /api/notes/explain-link`.

## 6. Frontend — Modal LinkExplainModal

- [x] 6.1 Crear `LinkExplainModalComponent` standalone con `p-dialog`: inputs `sourcePath`, `targetPath`, `visible`; output `visibleChange`.
- [x] 6.2 Al abrirse (`visible = true`), llamar al servicio `explainLink` y mostrar spinner hasta recibir la respuesta.
- [x] 6.3 Mostrar el texto de la explicación con `white-space: pre-wrap` cuando la respuesta llega.
- [x] 6.4 Mostrar mensaje de error genérico en caso de fallo; mostrar mensaje "La nota enlazada no existe." en caso de 404.
- [x] 6.5 El header del modal muestra los nombres cortos de ambas notas (sin ruta ni extensión).
- [x] 6.6 Integrar `LinkExplainModalComponent` en `explorer.component.ts`: añadir al template bindeado a los signals de ruta y visibilidad, y conectar con la acción "Explicar enlace" del menú contextual.
