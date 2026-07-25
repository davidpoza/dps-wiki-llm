# Internacionalizacion

La aplicacion usa Transloco con dos idiomas:

- `frontend/src/assets/i18n/es.json`;
- `frontend/src/assets/i18n/en.json`.

`detectLang()` selecciona espanol cuando `navigator.language` empieza por `es`; en caso contrario usa ingles. `reRenderOnLangChange` esta en `false`, por lo que la configuracion esta orientada a idioma inicial, no a cambio dinamico completo.

Fuente: `frontend/src/main.ts`, `frontend/src/assets/i18n/*.json`.

