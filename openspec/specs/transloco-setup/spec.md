# transloco-setup Specification

## Purpose
TBD - created by archiving change transloco-i18n-all-literals. Update Purpose after archive.
## Requirements
### Requirement: Transloco instalado y configurado

La app SHALL tener `@jsverse/transloco` instalado como dependencia de producción y configurado en `main.ts` con `provideTransloco`, idioma por defecto `es` y `APP_INITIALIZER` que precarga el fichero de traducción antes del primer render.

#### Scenario: Transloco cargado antes del arranque

- **WHEN** la app se inicia
- **THEN** el fichero `es.json` se carga completamente antes de que se monte cualquier componente, sin flicker de claves sin traducir

#### Scenario: Angular CLI sirve los ficheros i18n

- **WHEN** se ejecuta `ng serve` o `ng build`
- **THEN** los ficheros `src/assets/i18n/es.json` y `src/assets/i18n/en.json` son accesibles en `/assets/i18n/es.json` y `/assets/i18n/en.json` respectivamente

### Requirement: Ficheros de traducción completos

La app SHALL tener ficheros `src/assets/i18n/es.json` y `src/assets/i18n/en.json` con todas las claves de traducción organizadas por componente bajo los namespaces: `login`, `home`, `chat`, `ingest`, `jobs`, `review`, `git`, `explorer`, `common`.

#### Scenario: Fichero es.json contiene todas las claves

- **WHEN** se accede al fichero `es.json`
- **THEN** contiene claves para todos los literales visibles de la app, sin cadenas hardcodeadas pendientes

#### Scenario: Fichero en.json espeja la estructura de es.json

- **WHEN** se compara `en.json` con `es.json`
- **THEN** ambos ficheros tienen exactamente las mismas claves con los textos en el idioma correspondiente

