# Routing frontend

```mermaid
flowchart TB
  root["/"] --> jobs["/jobs"]
  login["/login"] --> public[Publico]
  jobs --> home[HomeComponent]
  ingest["/ingest"] --> home
  chat["/chat"] --> home
  review["/review"] --> home
  git["/git"] --> home
  explorer["/explorer/**"] --> explorerComp[ExplorerComponent]
  settings["/settings"] --> settingsComp[SettingsComponent]
  profile["/profile"] --> profileComp[ProfileComponent]
```

Todas las rutas salvo `/login` usan `authGuard`. `ExplorerComponent` tambien usa `unsavedChangesGuard` para evitar perder cambios no guardados.

Fuente: `frontend/src/main.ts`, `frontend/src/app/auth.guard.ts`, `frontend/src/app/unsaved-changes.guard.ts`.

