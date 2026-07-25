## 1. Filtrado de resultados en el frontend

- [x] 1.1 En `openLinkDiscovery()` (explorer.component.ts), antes de `linkDiscoveryResults.set(event.links)`, extraer todos los slugs ya presentes en `this.currentMarkdown` usando la regex `/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g`.
- [x] 1.2 Filtrar `event.links` excluyendo cualquier `DiscoveredLink` cuyo `slugFromPath(link.path)` esté en el conjunto de slugs existentes.
- [x] 1.3 Asignar el array filtrado a `linkDiscoveryResults`.

## 2. Verificación

- [ ] 2.1 Abrir una nota con wikilinks existentes, abrir el modal de Link Discovery y confirmar que los enlaces ya presentes no aparecen en los resultados.
- [ ] 2.2 Confirmar que el mensaje "sin resultados" aparece cuando todos los candidatos ya están enlazados.
- [ ] 2.3 Confirmar que los resultados sin enlace previo se siguen mostrando con normalidad.
