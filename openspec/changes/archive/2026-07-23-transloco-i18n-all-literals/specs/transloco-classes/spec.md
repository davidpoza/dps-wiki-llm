## ADDED Requirements

### Requirement: Sin literales hardcodeados en clases TypeScript

Todos los métodos de clase que produzcan texto visible al usuario (mensajes de error, notificaciones toast, diálogos de confirmación) SHALL obtener esos textos a través de `TranslocoService.translate()`. No SHALL existir ningún string de texto visible al usuario escrito directamente en código TypeScript.

Ubicaciones afectadas:
- `login.component.ts`: mensaje `'Invalid username or password'`
- `ingest.component.ts`: mensajes `'Upload failed'`, `'Ingest failed'`
- `git-history.component.ts`: mensajes de error en subscribe, texto del `window.confirm` de revert
- `explorer.component.ts`: todos los `messageService.add({ detail, summary })` y textos de `confirmationService.confirm`

#### Scenario: TranslocoService inyectado en componente

- **WHEN** un componente TypeScript necesita traducir textos en métodos de clase
- **THEN** inyecta `TranslocoService` con `private readonly t = inject(TranslocoService)` siguiendo el estilo del proyecto

#### Scenario: Mensaje de error de login traducido

- **WHEN** el login falla con credenciales inválidas
- **THEN** el componente asigna `this.t.translate('login.invalidCredentials')` al signal de error, y el mensaje visible en pantalla corresponde al texto en `es.json`

#### Scenario: Mensajes toast de explorer traducidos

- **WHEN** explorer llama a `messageService.add()`
- **THEN** los campos `summary` y `detail` usan `this.t.translate('explorer.someKey')` o `this.t.translate('explorer.someKey', { param })` en lugar de strings literales

### Requirement: window.confirm de git-history migrado a ConfirmationService

El uso de `window.confirm` en `git-history.component.ts` SHALL sustituirse por `ConfirmationService` de PrimeNG (ya disponible en el proyecto a través de explorer) para permitir textos i18n y mantener consistencia visual con el resto de la app.

#### Scenario: Diálogo de revert usa ConfirmationService

- **WHEN** el usuario hace clic en "Revertir a este commit"
- **THEN** aparece un `p-confirmDialog` con el mensaje obtenido de `TranslocoService` en lugar de un `window.confirm` nativo del navegador

#### Scenario: git-history importa ConfirmDialogModule y ConfirmationService

- **WHEN** se añade el diálogo de confirmación a git-history
- **THEN** el componente incluye `ConfirmDialogModule` en `imports` y `ConfirmationService` en `providers`, y el template incluye `<p-confirmDialog />`
