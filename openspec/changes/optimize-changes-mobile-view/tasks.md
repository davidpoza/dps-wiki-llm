## 1. Rediseño del template de entry-card

- [x] 1.1 Dividir `entry-row` en dos filas: `path-row` (icono editor + path) y `meta-row` (badge + stats + fecha + diff btn)
- [x] 1.2 Añadir botón/icono de editor (`pi pi-file-edit` o similar) en `path-row` que llame a `openFile(entry.path)`
- [x] 1.3 Mantener el path clicable existente como texto en `path-row`, eliminando el rol duplicado con el nuevo icono si procede

## 2. Ajuste de estilos CSS

- [x] 2.1 Reemplazar el layout de una fila (`display: flex; flex-wrap: wrap`) por un layout de dos filas (`display: grid; grid-template-rows: auto auto` o `display: flex; flex-direction: column`) en `.entry-card`
- [x] 2.2 Eliminar `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` de `.file-path` y añadir `word-break: break-all` para paths largos
- [x] 2.3 Estilizar `path-row`: `display: flex; align-items: center; gap: 0.4rem` con el icono de editor y el path
- [x] 2.4 Estilizar `meta-row`: `display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.8rem`
- [x] 2.5 Verificar que el icono de editor tiene tamaño de toque adecuado en mobile (mínimo 44px de área)

## 3. Verificación visual y E2E

- [x] 3.1 Comprobar que el path completo se muestra sin truncado en mobile (≤ 600px)
- [x] 3.2 Comprobar que el icono de editor abre el fichero correctamente en el editor
- [x] 3.3 Verificar que el layout de dos líneas se ve correctamente en desktop
- [x] 3.4 Verificar que el botón de diff sigue funcionando y el diff se muestra correctamente debajo de la tarjeta
