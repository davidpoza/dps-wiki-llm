# Arquitectura frontend

La aplicacion frontend es Angular 21 con standalone components, signals y PrimeNG. Se construye con pnpm y se sirve como SPA estatica via nginx.

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `frontend/src/main.ts` | Bootstrap, providers, rutas, Transloco y tema inicial. |
| `frontend/src/app/components/` | Pantallas y componentes UI. |
| `frontend/src/app/services/` | Cliente API, auth, jobs store, loading, plataforma, tema. |
| `frontend/src/app/types.ts` | Tipos compartidos del frontend. |
| `frontend/src/assets/i18n/` | Traducciones `es` y `en`. |
| `frontend/src/styles.scss` | Estilos globales. |

## Dependencias relevantes

| Dependencia | Uso |
|---|---|
| `@angular/*` | Framework SPA. |
| `primeng`, `primeicons`, `@primeuix/themes` | UI y tema Aura. |
| `@jsverse/transloco` | i18n. |
| `@milkdown/*`, `marked`, `yaml` | Edicion/renderizado Markdown y frontmatter. |
| `cytoscape`, `cytoscape-fcose` | Grafo de notas. |
| `rxjs` | HTTP/SSE wrappers y asincronia. |

Fuente: `frontend/package.json`, `frontend/src/main.ts`.

