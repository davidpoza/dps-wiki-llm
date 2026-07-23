## 1. Implementación del fix de navegación

- [x] 1.1 En `explorer.component.ts`, actualizar `navigateToWikilink` para buscar primero por `node.data` (ruta completa, case-insensitive, con y sin `.md`), y usar el label-match actual como fallback
- [x] 1.2 Verificar que los enlaces simples (sin ruta) siguen funcionando correctamente tras el cambio

## 2. Verificación manual

- [x] 2.1 Crear o usar un archivo en una subcarpeta (e.g. `wiki/concepts/glutamina.md`) y comprobar que `[[wiki/concepts/glutamina|glutamina]]` navega a él al hacer clic
- [x] 2.2 Comprobar que un enlace roto con ruta (e.g. `[[wiki/concepts/inexistente|x]]`) muestra el toast de advertencia sin crash
