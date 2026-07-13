## 1. Instalación y configuración de Transloco

- [x] 1.1 Instalar `@jsverse/transloco` con pnpm en `frontend/`
- [x] 1.2 Crear `frontend/src/assets/i18n/es.json` con todas las claves organizadas por namespace (`login`, `home`, `chat`, `ingest`, `jobs`, `review`, `git`, `explorer`, `common`)
- [x] 1.3 Crear `frontend/src/assets/i18n/en.json` con las mismas claves en inglés
- [x] 1.4 Configurar `provideTransloco` en `frontend/src/main.ts` con `defaultLang: 'es'`, `HttpLoader` y `APP_INITIALIZER` que precarga `es.json`

## 2. Migración de templates

- [x] 2.1 Añadir `TranslocoPipe` a imports y sustituir literales en `login.component.ts` (labels, placeholders de Username/Password/Sign in)
- [x] 2.2 Añadir `TranslocoPipe` a imports y sustituir literales en `home.component.ts` (brand, tab labels, botones Explorer/Sign out)
- [x] 2.3 Añadir `TranslocoPipe` a imports y sustituir literales en `chat.component.ts` (placeholder textarea, label botón Ask, label Evidence)
- [x] 2.4 Añadir `TranslocoPipe` a imports y sustituir literales en `ingest.component.ts` (Mode, Upload File, Ingest File, Ingest Link, Ingest URL, hints, notice de job enqueued con interpolación `{{ id }}`)
- [x] 2.5 Añadir `TranslocoPipe` a imports y sustituir literales en `jobs-viewer.component.ts` (empty state, Revert, Files, review notice)
- [x] 2.6 Añadir `TranslocoPipe` a imports y sustituir literales en `review.component.ts` (empty state, Connection candidates, No candidates, Manual connections, Search files, Submit Review, Load Candidates, Job prefix)
- [x] 2.7 Añadir `TranslocoPipe` a imports y sustituir literales en `git-history.component.ts` (header, Actualizar, loading/empty states, archivo(s) modificado(s), Ver diff/Ocultar diff, Cargando diff, Revertir a este commit)
- [x] 2.8 Añadir `TranslocoPipe` a imports y sustituir literales de template en `explorer.component.ts` (Home, Sign out, headers de diálogos, labels de botones, placeholders de inputs)

## 3. Migración de literales en clases TypeScript

- [x] 3.1 Inyectar `TranslocoService` en `login.component.ts` y sustituir `'Invalid username or password'`
- [x] 3.2 Inyectar `TranslocoService` en `ingest.component.ts` y sustituir `'Upload failed'` e `'Ingest failed'`
- [x] 3.3 Migrar `window.confirm` de `git-history.component.ts` a `ConfirmationService` + `p-confirmDialog`; inyectar `TranslocoService` y sustituir todos los mensajes de error en subscribe
- [x] 3.4 Inyectar `TranslocoService` en `explorer.component.ts` y sustituir todos los `messageService.add({ summary, detail })` y textos de `confirmationService.confirm` por llamadas a `this.t.translate('explorer.key', { params })`

## 4. Verificación

- [x] 4.1 Ejecutar `ng build` y confirmar compilación sin errores
- [x] 4.2 Arrancar la app con `ng serve` y verificar que no hay claves sin traducir visibles en ninguna pantalla (login, home, ingest, jobs, chat, review, git, explorer)
- [x] 4.3 Verificar que los mensajes de error, toasts y diálogos de confirmación muestran texto correcto en español
