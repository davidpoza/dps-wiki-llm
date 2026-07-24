## 1. Añadir atajo de teclado en explorer

- [x] 1.1 En `explorer.component.ts`, después del `@HostListener('document:keydown.control.s', ...)` (línea ~2076), añadir:
  ```ts
  @HostListener('document:keydown.control.shift.s', ['$event'])
  onCtrlShiftS(event: Event): void {
    event.preventDefault();
    this.sync();
  }
  ```
- [x] 1.2 Verificar manualmente que `Ctrl+Shift+S` con un fichero abierto dispara el botón de sync (icono `pi-cloud-download` muestra loading)
