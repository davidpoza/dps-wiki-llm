## Context

La aplicación usa Spring Boot 3 + PostgreSQL (Flyway) en backend y Angular 21 + PrimeNG en frontend. La autenticación actual en `AuthController` no persiste ningún evento de login. La IP del cliente llega via `HttpServletRequest`. La geolocalización requiere una base de datos de IPs que puede ser embebida (GeoLite2 de MaxMind, distribución gratuita MMDB).

## Goals / Non-Goals

**Goals:**
- Registrar cada intento de login (éxito y fallo, incluyendo 2FA) con IP, geolocalización y timestamp.
- Exponer los últimos 20 registros del usuario autenticado via REST.
- Mostrar el historial en la pantalla de perfil con tabla PrimeNG.
- Funcionar sin llamadas externas en tiempo de petición (geolocalización local).

**Non-Goals:**
- Historial global de todos los usuarios (solo vista propia).
- Alertas o notificaciones de login sospechoso.
- Retención configurable de eventos (se mantienen todos indefinidamente en V1).
- Geolocalización a nivel ciudad/coordenadas (solo país/región es suficiente).

## Decisions

### D1: Geolocalización embebida con MaxMind GeoLite2

**Decisión**: Usar `com.maxmind.geoip2:geoip2` con la base de datos MMDB incluida en el classpath (descargada en build time y empaquetada en el JAR).

**Alternativas consideradas**:
- API externa (ip-api.com, ipstack): introduce latencia y dependencia externa en cada login → rechazada.
- Base de datos propia de IPs: demasiado esfuerzo de mantenimiento → rechazada.
- Sin geolocalización: pierde valor informativo para el usuario → rechazada.

**Rationale**: GeoLite2-Country (~6MB) es gratis, embebible, y ofrece resolución a nivel país/región sin latencia de red.

### D2: Tabla dedicada `login_events` en lugar de enriquecer `users`

**Decisión**: Nueva tabla `login_events` con FK a `users.id`, timestamp, IP, país, región, success (boolean), y motivo de fallo opcional.

**Rationale**: Mantiene `users` limpia; permite paginación y limpieza futura fácil; un usuario puede tener N eventos.

### D3: Registro en `AuthController` directamente (sin AOP)

**Decisión**: Llamar a `LoginEventService.record(...)` explícitamente en los bloques try/catch de `login()` y `loginTwoFactor()`.

**Alternativas**: AOP `@AfterReturning/@AfterThrowing` — añade complejidad de configuración sin beneficio real aquí.

### D4: Límite fijo de 20 registros en el endpoint (sin paginación en V1)

**Decisión**: `GET /auth/login-history` devuelve los últimos 20 eventos ordenados por timestamp DESC, sin parámetros de paginación.

**Rationale**: Suficiente para el caso de uso de seguridad personal; simplifica la UI.

### D5: IP del cliente via `X-Forwarded-For` con fallback a `remoteAddr`

**Decisión**: Leer `X-Forwarded-For` primero (primer valor si hay lista), con fallback a `request.getRemoteAddr()`.

**Rationale**: La app corre detrás de un proxy/nginx en producción.

## Risks / Trade-offs

- **Riesgo: GeoLite2 requiere cuenta MaxMind para descarga** → Mitigación: almacenar el MMDB en el repositorio (es un archivo binario de ~6MB, aceptable) o descargar en el Dockerfile. Si no está disponible, registrar IP sin geolocalización (campo null).
- **Riesgo: IP spoofing via X-Forwarded-For** → Mitigación: en V1 es informativo, no para decisiones de seguridad críticas.
- **Riesgo: Crecimiento ilimitado de la tabla** → Mitigación: añadir índice en `(user_id, created_at)` y documentar que se puede añadir purga periódica en V2.

## Migration Plan

1. `V11__login_events.sql`: crear tabla `login_events`.
2. Desplegar backend con nuevo servicio y endpoint.
3. Desplegar frontend con nueva sección de perfil.
4. Rollback: eliminar la sección del frontend y el endpoint — la tabla puede quedar vacía sin impacto.
