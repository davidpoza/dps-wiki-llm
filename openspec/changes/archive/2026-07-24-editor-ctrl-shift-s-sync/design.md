## Context

`explorer.component.ts` ya usa el patrón `@HostListener('document:keydown.control.s', ['$event'])` para guardar. El método `sync()` (línea ~2316) ejecuta `this.api.syncWebdav()` y gestiona loading/errores. Solo falta un `@HostListener` adicional para `control.shift.s` que delegue en el mismo método.

## Goals / Non-Goals

**Goals:**
- `Ctrl+Shift+S` dispara `sync()` desde cualquier foco dentro del explorer (editor, árbol, toolbar)
- El evento del navegador se cancela (`preventDefault`) para evitar comportamientos nativos

**Non-Goals:**
- Mostrar ningún indicador adicional (el botón de sync ya refleja el estado `syncing()`)
- Funcionar fuera del componente explorer (otras pantallas no tienen sync)

## Decisions

### D1: `@HostListener` sobre `document:keydown` en lugar de escuchar en el editor Milkdown

El atajo `Ctrl+S` existente usa el mismo enfoque (`document:keydown.control.s`), lo que garantiza que captura el evento aunque el foco esté en el editor Milkdown (que intercepta teclas a nivel de `contenteditable`). Usar `document:keydown.control.shift.s` sigue el mismo patrón y asegura consistencia.

**Alternativa descartada**: listener dentro del `EditorView` de Milkdown — más frágil, requiere acceso al contexto del editor y no aporta ventajas.

## Risks / Trade-offs

- [Riesgo: colisión con atajo del navegador/OS para `Ctrl+Shift+S`] → En la mayoría de navegadores `Ctrl+Shift+S` no tiene acción predeterminada relevante; `preventDefault()` cubre el caso donde la tenga.
