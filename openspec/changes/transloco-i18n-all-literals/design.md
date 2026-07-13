## Context

La app Angular 21 tiene 7 componentes y ~120 literales visibles dispersos entre templates y métodos de clase. Algunos literales están en español (git-history, explorer) y otros en inglés (login, chat, ingest, jobs), sin ningún sistema de i18n. Transloco es la librería de i18n estándar de facto para Angular standalone (sin NgModules), compatible con Angular 21.

## Goals / Non-Goals

**Goals:**
- Centralizar todos los textos visibles en ficheros JSON de traducción.
- Cubrir templates (pipe/directiva) y clases TS (`TranslocoService`).
- Idioma base operativo: español (`es`). Inglés (`en`) como idioma secundario con los mismos textos traducidos.
- La app debe compilar y funcionar correctamente tras el cambio.

**Non-Goals:**
- Selector de idioma en la UI (fuera de alcance en esta iteración).
- Traducción de mensajes de error del backend / API.
- Pluralización avanzada o formatos de fecha/número localizados.

## Decisions

### 1. Librería: `@jsverse/transloco` v7.x

`@jsverse/transloco` es la opción moderna para Angular standalone (sin `NgModule`). `@angular/localize` requiere compilación por-locale y es más adecuado para SSR/SSG. Transloco ofrece lazy loading, pipe reactivo y `TranslocoService` sincrónico/observable, encajando bien con la arquitectura signals del proyecto.

Alternativa descartada: `ngx-translate` — mantenimiento reducido, no official para Angular 17+.

### 2. Idioma base: `es` (español)

La mayoría de literales nuevos y el componente con más texto (explorer) ya están en español. Unificar en español como `defaultLang` es lo más consistente con el estado actual.

### 3. Estrategia de carga: eager (inline en el bundle)

La app es pequeña y no tiene lazy routes con grandes volúmenes de texto. Se usa `TranslocoModule` con `provideTransloco` y se precarga `es.json` en el `APP_INITIALIZER` para que los textos estén disponibles desde el primer render, evitando flicker.

Alternativa descartada: lazy loading por ruta — añade complejidad innecesaria para el tamaño actual.

### 4. Ubicación de ficheros: `src/assets/i18n/{lang}.json`

Es la convención de Transloco por defecto. `src/assets/` ya es servida estáticamente por el CLI de Angular sin configuración extra.

### 5. Estructura de claves: por componente con prefijo corto

```json
{
  "login": { "username": "Usuario", "password": "Contraseña", "signIn": "Entrar", ... },
  "home": { "brand": "DPS Wiki", ... },
  "chat": { "placeholder": "Haz una pregunta…", ... },
  "ingest": { ... },
  "jobs": { ... },
  "review": { ... },
  "git": { ... },
  "explorer": { ... },
  "common": { "cancel": "Cancelar", "error": "Error", "save": "Guardar", ... }
}
```

Las claves de interpolación usan la sintaxis `{{ value }}` de Transloco: `"jobEnqueued": "Job encolado: {{ id }}"`.

### 6. Uso en templates: pipe `transloco`

```html
{{ 'login.signIn' | transloco }}
<button [label]="'login.signIn' | transloco">
<input [placeholder]="'chat.placeholder' | transloco" />
```

El componente debe importar `TranslocoModule` (o `TranslocoPipe` standalone).

### 7. Uso en clases: `TranslocoService.translate()`

```ts
private readonly t = inject(TranslocoService);
// En métodos síncronos (tras preload):
const msg = this.t.translate('explorer.saveSuccess');
// O con parámetros:
const msg = this.t.translate('explorer.renameSuccess', { name });
```

Se inyecta con `inject()` para mantener coherencia con el estilo del proyecto (signals + inject).

## Risks / Trade-offs

- **Flicker en primer render** si la traducción se carga de forma asíncrona → Mitigación: `APP_INITIALIZER` que espera la carga de `es.json` antes de montar la app.
- **Claves rotas en runtime** (typos en claves) no se detectan en compilación → Mitigación: el entorno de desarrollo muestra la clave fallida en lugar del texto, lo que hace el error obvio.
- **window.confirm en git-history** usa una cadena multilínea compleja — se sustituye por `confirmationService` de PrimeNG (ya disponible en explorer) para evitar cadenas complejas en i18n.

## Migration Plan

1. Instalar `@jsverse/transloco` con pnpm.
2. Crear `src/assets/i18n/es.json` con todas las claves.
3. Crear `src/assets/i18n/en.json` con la traducción inglesa equivalente.
4. Configurar Transloco en `main.ts` con `provideTransloco` + `APP_INITIALIZER`.
5. Actualizar cada componente: añadir `TranslocoPipe` a `imports`, sustituir literales.
6. Para clases: inyectar `TranslocoService`, sustituir strings.
7. Migrar `window.confirm` de git-history a `ConfirmationService` + clave i18n.
8. Verificar compilación `ng build` sin errores.

**Rollback**: revertir los commits de componentes y eliminar la dependencia de Transloco. Los ficheros JSON son aditivos y no rompen nada si permanecen.
