## 1. Fix scrollbar: mover ancho a tab-content

- [x] 1.1 En `home.component.scss`, quitar `width: min(1100px, calc(100vw - 32px))`, `margin: 0 auto` y `padding` de `.workspace`; dejar solo `flex: 1`, `min-height: 0` y `overflow-y: auto`
- [x] 1.2 En `.tab-content`, añadir `max-width: 1100px`, `width: calc(100% - 32px)`, `margin: 0 auto` y `padding: 20px 0 40px`
- [x] 1.3 Ajustar `.tab-content.full-bleed` para que override el max-width con `max-width: 100%`, `width: 100%`, `margin: 0` y `padding: 0`
- [x] 1.4 Actualizar el `@media (max-width: 600px)` para que apunte a `.tab-content` en lugar de `.workspace` (`width: calc(100vw - 24px)`, `padding: 14px 0 32px`)

## 2. Eliminar botón Actualizar en git-history

- [x] 2.1 En `git-history.component.ts`, eliminar el elemento `<button class="refresh-btn" (click)="load()">{{ 'git.refresh' | transloco }}</button>`
- [x] 2.2 Eliminar los estilos CSS de `.refresh-btn` en el mismo componente

## 3. Settings: reorganizar en dos tabs

- [x] 3.1 Añadir `TabsModule` de `primeng/tabs` al array `imports` de `settings.component.ts`
- [x] 3.2 Envolver todo el contenido dentro de `<section class="workspace">` en un `<p-tabs [value]="1">` (tab Datos activa por defecto)
- [x] 3.3 Crear `<p-tab-panel header="Datos" [value]="1">` con las secciones: Apariencia, Índice del Vault, Keywords, Health Check, Recursos, Mantenimiento y Broken Links, y el footer de versión
- [x] 3.4 Crear `<p-tab-panel header="Prompts" [value]="0">` con la sección "Prompts del LLM"
- [x] 3.5 Verificar visualmente que todas las secciones aparecen en la tab correcta y que los modales (keyword, health-check, dedup, broken-links) siguen funcionando
