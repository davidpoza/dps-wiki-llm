## Why

Desde el editor Markdown no hay forma de disparar la sincronización WebDAV con el teclado: hay que salir del foco del editor y pulsar el botón de sync en la toolbar. Añadir `Ctrl+Shift+S` permite sincronizar sin interrumpir el flujo de escritura, de forma coherente con `Ctrl+S` para guardar.

## What Changes

- Añadir `@HostListener('document:keydown.control.shift.s', ['$event'])` en `explorer.component.ts` que llame al método `sync()` ya existente y cancele el evento del navegador.

## Capabilities

### New Capabilities

_(ninguna; es una extensión del atajo de teclado del editor)_

### Modified Capabilities

- `webdav-vault-sync`: Se añade un acceso por teclado (`Ctrl+Shift+S`) para disparar la sincronización manual desde el editor.

## Impact

- `frontend/src/app/components/explorer.component.ts` — un único `@HostListener` adicional de 4 líneas; sin cambios en backend ni API.
