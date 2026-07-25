## 1. Frontend fix

- [x] 1.1 Extraer helper `resolveWikilinkPath(target)` en `explorer.component.ts` que resuelve un nombre de wikilink a su ruta relativa completa usando `allFiles()`
- [x] 1.2 Actualizar `openLinkExplainModal()` para llamar a `resolveWikilinkPath` y pasar la ruta resuelta (o `null`) a `linkExplainTarget`
- [x] 1.3 Actualizar `fetchExplanation()` en `link-explain-modal.component.ts` para mostrar "La nota enlazada no existe." cuando `src` o `tgt` son null, en lugar de retornar silenciosamente

## 2. Verificación

- [x] 2.1 Verificar que al hacer clic derecho sobre un wikilink existente y seleccionar "Explicar enlace" se obtiene la explicación correctamente (sin error 404)
- [x] 2.2 Verificar que al hacer clic derecho sobre un wikilink roto (nota inexistente) el modal muestra "La nota enlazada no existe."
