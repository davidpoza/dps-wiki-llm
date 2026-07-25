# Seguridad backend

## Configuracion

`SecurityConfig`:

- deshabilita CSRF;
- habilita CORS;
- usa sesiones stateless;
- permite login, 2FA, health, info y OpenAPI;
- exige autenticacion para el resto;
- devuelve 401 cuando falta autenticacion;
- inserta `JwtAuthFilter` antes de `UsernamePasswordAuthenticationFilter`.

## Usuarios

`UserService.seedAdmin` crea un usuario admin solo si `ADMIN_USERNAME` y `ADMIN_PASSWORD` estan configurados y no existe ya el usuario.

## Riesgos

- El default de `application.yml` incluye usuario/password admin de desarrollo y un JWT secret de prueba; en despliegue se deben reemplazar por variables reales.
- Los tokens SSE en query string pueden aparecer en logs de proxy si se habilita logging de URL completa.

Fuente: `SecurityConfig.java`, `JwtUtil.java`, `UserService.java`, `application.yml`.

