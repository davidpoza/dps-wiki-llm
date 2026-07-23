## 1. Base de datos y migración

- [x] 1.1 Crear `V11__login_events.sql` con la tabla `login_events` (id UUID PK, user_id UUID FK users.id, created_at TIMESTAMPTZ, ip_address VARCHAR, country VARCHAR, region VARCHAR, success BOOLEAN, failure_reason VARCHAR nullable)
- [x] 1.2 Añadir índice compuesto `(user_id, created_at DESC)` en la migración

## 2. Dominio y persistencia (backend)

- [x] 2.1 Crear entity `LoginEvent` en `com.dpswikillm.domain` con los campos de la tabla y relación `@ManyToOne` a `User`
- [x] 2.2 Crear `LoginEventRepository` (Spring Data JPA) con método `findTop20ByUserOrderByCreatedAtDesc(User user)`
- [x] 2.3 Crear DTO record `LoginEventDto` con campos: `id`, `createdAt`, `ipAddress`, `country`, `region`, `success`, `failureReason`

## 3. Geolocalización (backend)

- [x] 3.1 Añadir dependencia `com.maxmind.geoip2:geoip2` en `build.gradle` (o `pom.xml`)
- [x] 3.2 Obtener y añadir `GeoLite2-Country.mmdb` en `src/main/resources/geoip/` (descargar de MaxMind o usar fichero de test reducido)
- [x] 3.3 Crear `GeoLocationService` que carga el MMDB del classpath y expone `resolve(String ip): Optional<GeoLocation>` (record con country, region); devuelve `Optional.empty()` para IPs privadas o desconocidas sin lanzar excepción

## 4. Servicio de eventos de login (backend)

- [x] 4.1 Crear `LoginEventService` con método `record(User user, HttpServletRequest request, boolean success, String failureReason)` que: extrae IP de `X-Forwarded-For` o `remoteAddr`, llama a `GeoLocationService`, guarda `LoginEvent`
- [x] 4.2 Añadir método `getHistory(User user): List<LoginEventDto>` que delega en `LoginEventRepository` y mapea a DTOs

## 5. Registro de eventos en AuthController (backend)

- [x] 5.1 Inyectar `LoginEventService` y `HttpServletRequest` en `AuthController`
- [x] 5.2 Llamar a `loginEventService.record(...)` en el bloque `try` de `login()` para éxito (cuando no hay 2FA pendiente)
- [x] 5.3 Llamar a `loginEventService.record(...)` en el bloque `catch (BadCredentialsException)` de `login()` con `success=false, reason=BAD_CREDENTIALS`
- [x] 5.4 Llamar a `loginEventService.record(...)` en `loginTwoFactor()` para éxito y para fallo de código (con `reason=INVALID_2FA_CODE`)

## 6. Endpoint REST (backend)

- [x] 6.1 Añadir `GET /auth/login-history` en `AuthController` anotado con `@GetMapping("/login-history")`, protegido por `@AuthenticationPrincipal`, que devuelve `List<LoginEventDto>`
- [x] 6.2 Verificar que `SecurityConfig` permite el endpoint solo a usuarios autenticados (ya cubierto por la configuración global)

## 7. Servicio y tipos (frontend)

- [x] 7.1 Añadir interfaz `LoginEvent` en `auth.service.ts` con campos: `id`, `createdAt`, `ipAddress`, `country`, `region`, `success`, `failureReason`
- [x] 7.2 Añadir método `fetchLoginHistory(): Promise<LoginEvent[]>` en `AuthService` que hace `GET /api/auth/login-history`

## 8. UI en pantalla de perfil (frontend)

- [x] 8.1 Importar `TableModule` y `TagModule` (o `BadgeModule`) de PrimeNG en `profile.component.ts`
- [x] 8.2 Añadir signal `loginHistory = signal<LoginEvent[]>([])` y `historyLoading = signal(true)` en `ProfileComponent`
- [x] 8.3 Llamar a `fetchLoginHistory()` en `ngOnInit` y poblar los signals
- [x] 8.4 Añadir sección `<section class="card">` con `<p-table>` que muestre columnas: Fecha/Hora, IP, País, Región, Resultado
- [x] 8.5 Columna Resultado: mostrar `<p-tag severity="success">` o `<p-tag severity="danger">` según `success`, con el `failureReason` en el caso de fallo
- [x] 8.6 Mostrar `—` en celdas de País/Región cuando el valor sea null
- [x] 8.7 Añadir claves i18n en los ficheros de traducción (es/en) para los textos nuevos de la sección (`profile.loginHistory`, `profile.loginHistoryDate`, `profile.loginHistoryIp`, `profile.loginHistoryCountry`, `profile.loginHistoryRegion`, `profile.loginHistoryResult`, `profile.loginHistorySuccess`, `profile.loginHistoryFailed`, `profile.loginHistoryEmpty`)
