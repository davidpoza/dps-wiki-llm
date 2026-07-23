## Why

Las notas del vault contienen enlaces wiki `[[slug]]` en la sección **Related** que pueden apuntar a ficheros que ya no existen (renombrados, borrados o mal escritos). No hay ningún mecanismo que detecte estos enlaces rotos, por lo que la sección Related puede acumular referencias muertas silenciosamente.

## What Changes

- Nueva sección **"Enlaces rotos"** en la pantalla de Settings.
- Botón "Buscar enlaces rotos" que lanza un proceso asíncrono SSE.
- Progreso en tiempo real mientras se escanean los ficheros del vault.
- Al terminar, se abre un modal con lista de checkboxes de todos los enlaces rotos encontrados (agrupados por fichero origen).
- El usuario puede seleccionar cuáles eliminar; con confirmación, el backend borra esas entradas de la sección Related de cada fichero.

## Capabilities

### New Capabilities

- `broken-links-scan`: Escaneo SSE de la sección Related de todos los ficheros del vault (`wiki/concepts`, `wiki/sources`, `wiki/topics`) para detectar enlaces `[[slug]]` que no corresponden a ningún fichero existente en el vault. Emite progreso (ficheros procesados / total) y al completar la lista de broken links encontrados.
- `broken-links-delete`: Endpoint que recibe una lista de pares `{file, link}` y elimina esas entradas de la sección Related del fichero correspondiente, guardando el cambio en disco.

### Modified Capabilities

(ninguna — no cambia ningún spec existente)

## Impact

- **Backend**: nuevo endpoint SSE `GET /api/settings/broken-links/scan` y endpoint de mutación `DELETE /api/settings/broken-links` en `SettingsController`. Nuevo servicio `BrokenLinkScanService`. Nuevo DTO `BrokenLinkEntry` y `BrokenLinkScanProgress`.
- **Frontend**: nueva sección en `SettingsComponent`, nuevo método en `ApiService`, nuevo componente modal `BrokenLinksModalComponent` con PrimeNG `DialogModule` y `CheckboxModule`.
- **Sin dependencias externas nuevas**: reutiliza `MarkdownService` existente para parsear secciones y escribir ficheros.
