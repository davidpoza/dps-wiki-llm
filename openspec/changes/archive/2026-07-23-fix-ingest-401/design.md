## Context

El backend usa Spring Security con JWT stateless. `JwtUtil` acepta un secreto configurable vía `JWT_SECRET`; si está vacío, genera una clave aleatoria en memoria en cada arranque. Esto funciona hasta que el proceso se reinicia (en dev es habitual), momento en el que todos los tokens firmados con la clave anterior se vuelven inválidos y cualquier endpoint protegido devuelve 401.

El frontend tiene un interceptor HTTP que añade el header `Authorization: Bearer <token>` en las peticiones, pero no intercepta las respuestas: si el servidor devuelve 401 (token obsoleto), el error simplemente se propaga al componente sin ningún mecanismo de recuperación automático.

## Goals / Non-Goals

**Goals:**
- Eliminar los 401 inesperados causados por reinicios del backend en desarrollo.
- Garantizar que un 401 en el frontend siempre lleva al usuario al flujo de login.

**Non-Goals:**
- Implementar refresh tokens o rotación de JWT.
- Cambiar la expiración del token ni la política de sesiones.
- Modificar la lógica de autorización por roles.

## Decisions

**D1 — Secreto JWT estable por defecto en dev**

Añadir un valor por defecto fijo en `application.yml` para `app.jwt.secret`:

```yaml
app:
  jwt:
    secret: ${JWT_SECRET:dGVzdC1kZXYtand0LXNlY3JldC1kby1ub3QtdXNlLWluLXByb2R1Y3Rpb24=}
```

El valor decodificado (`test-dev-jwt-secret-do-not-use-in-production`, 44 bytes) cumple el mínimo de 32 bytes que exige `JwtUtil`. En producción, `JWT_SECRET` debe sobreescribirse con un secreto real generado con `openssl rand -base64 64`.

Alternativa descartada: hacer `JWT_SECRET` obligatorio (fail-fast). Se rechaza porque rompe el flujo de "docker-compose up" sin configuración previa, que es la experiencia de primera vez esperada.

**D2 — Interceptar 401 en el frontend y forzar logout**

Ampliar `authInterceptor` con `catchError`: si la respuesta es 401, llamar a `AuthService.logout()` (limpia localStorage + señal) y redirigir a `/login` via `Router`.

Alternativa descartada: manejar el 401 en cada componente individualmente. Se rechaza porque es repetitivo y fácil de olvidar en futuros endpoints.

## Risks / Trade-offs

- **Secreto de dev conocido**: El valor por defecto es público (está en el repo). No supone riesgo en dev, pero es importante que producción siempre configure `JWT_SECRET`. Se mitiga documentándolo en `.env.sample`.
- **Loop de redirección**: Si `/login` mismo devuelve 401, el interceptor podría redirigir en bucle. Se mitiga excluyendo `/api/auth/login` de la gestión de 401 (ya está excluido en el interceptor actual).
