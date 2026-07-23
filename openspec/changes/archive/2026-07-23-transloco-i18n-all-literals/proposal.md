## Why

La app mezcla literales en inglés y español dispersos entre templates y clases TypeScript sin ningún sistema de i18n, lo que hace imposible mantener la consistencia textual y añadir nuevos idiomas en el futuro. Usar Transloco como única fuente de verdad para todos los textos centraliza las traducciones, elimina la mezcla de idiomas y deja la app lista para soporte multiidioma.

## What Changes

- Instalar `@jsverse/transloco` y configurarlo en el módulo raíz de Angular.
- Crear ficheros de traducción JSON bajo `src/assets/i18n/` (idioma base: `es.json`; idioma secundario: `en.json`).
- Reemplazar todos los literales visibles en templates (`label=`, texto inline, `placeholder=`, `title=`, `header=`) por el pipe `transloco` o la directiva `transloco`.
- Reemplazar todos los literales en clases TypeScript (mensajes de error, notificaciones toast, diálogos de confirmación) usando `TranslocoService.translate()`.
- Eliminar textos hardcodeados en las 7 fuentes de componentes: `login`, `home`, `chat`, `ingest`, `jobs-viewer`, `review`, `git-history`.
- Eliminar textos hardcodeados en `explorer.component.ts` (el componente con más literales en clase).

## Capabilities

### New Capabilities

- `transloco-setup`: Instalación, configuración de Transloco y creación de ficheros i18n (`es.json`, `en.json`).
- `transloco-templates`: Sustitución de literales en todos los templates Angular por pipe/directiva Transloco.
- `transloco-classes`: Sustitución de literales en clases TypeScript usando `TranslocoService`.

### Modified Capabilities

## Impact

- **Ficheros afectados**: `frontend/package.json`, `frontend/src/main.ts` o módulo de configuración, todos los ficheros en `frontend/src/app/components/` (7 componentes), `frontend/src/assets/i18n/es.json` (nuevo), `frontend/src/assets/i18n/en.json` (nuevo).
- **Sin cambios de API**: solo presentación y textos.
- **Dependencia nueva**: `@jsverse/transloco` ^7.x.
