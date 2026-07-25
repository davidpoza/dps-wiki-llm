## 1. Frontend — Editor toolbar

- [x] 1.1 En `explorer.component.ts` (~línea 1466), cambiar la condición de `isKeywordEligible` a `path.startsWith('wiki/')` (eliminar las dos comprobaciones de subcarpeta)

## 2. Frontend — Modal de selección en Configuración

- [x] 2.1 En `keyword-selection-modal.component.ts` (~línea 282), cambiar `this.api.listNotes(['wiki/concepts', 'wiki/sources'])` a `this.api.listNotes(['wiki'])`

## 3. Spec base — Actualizar requisitos

- [x] 3.1 Aplicar el delta spec al archivo `openspec/specs/keyword-regeneration-ui/spec.md` para reflejar la elegibilidad ampliada a cualquier nota bajo `wiki/`

## 4. Verificación

- [x] 4.1 Abrir una nota en `wiki/topics/` y confirmar que el botón "Regenerar keywords" aparece en la barra de herramientas
- [x] 4.2 Abrir una nota en `wiki/concepts/` y confirmar que el botón sigue apareciendo
- [ ] 4.3 Confirmar que al pulsar el botón se encola el job y navega a `/jobs`
- [x] 4.4 Abrir el modal de Configuración → Keywords y confirmar que aparecen notas de todas las subcarpetas de `wiki/`
- [x] 4.5 Confirmar que una nota fuera de `wiki/` (p.ej. en `attachments/`) NO muestra el botón
