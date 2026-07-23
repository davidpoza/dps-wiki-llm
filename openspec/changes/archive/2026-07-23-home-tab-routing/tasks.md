## 1. Rutas en main.ts

- [x] 1.1 Eliminar la ruta `{ path: '', component: HomeComponent, canActivate: [authGuard] }`
- [x] 1.2 Añadir redirección `{ path: '', redirectTo: 'jobs', pathMatch: 'full' }`
- [x] 1.3 Añadir las cinco rutas de tab: `jobs`, `ingest`, `chat`, `review`, `git`, todas con `component: HomeComponent` y `canActivate: [authGuard]`

## 2. HomeComponent — sincronización URL ↔ tab

- [x] 2.1 Inyectar `ActivatedRoute` y `DestroyRef` en `HomeComponent`
- [x] 2.2 Importar `takeUntilDestroyed` de `@angular/core/rxjs-interop`
- [x] 2.3 En `ngOnInit`, suscribir `route.url` (con `takeUntilDestroyed`) y actualizar `activeTab` con el primer segmento de la URL (`segments[0]?.path`)
- [x] 2.4 En el método de cambio de tab (click en botón de tab), navegar a la ruta del tab con `router.navigate([tabId])` en lugar de actualizar solo la signal `activeTab`
- [x] 2.5 Eliminar la inicialización de `activeTab` como `signal<Tab>('jobs')` y reemplazarla por `signal<Tab>('jobs')` inicializada desde la URL en `ngOnInit` (o mantener `jobs` como valor por defecto seguro hasta que la suscripción dispare)

## 3. Verificación E2E

- [x] 3.1 Verificar que `/` redirige a `/jobs` y muestra el tab Jobs
- [x] 3.2 Verificar que navegar directamente a `/chat` abre el tab Chat
- [x] 3.3 Verificar que hacer clic en un tab actualiza la URL sin recargar la página
- [x] 3.4 Verificar que el botón atrás vuelve al tab anterior
- [x] 3.5 Verificar que acceder a `/ingest` sin autenticación redirige a `/login`
