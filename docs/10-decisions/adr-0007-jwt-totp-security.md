# ADR-0007: JWT stateless con TOTP opcional

- Estado: Inferida del codigo actual
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Seguridad aplicativa

## Contexto

La UI y API requieren usuarios autenticados; algunas acciones administrativas requieren rol.

## Problema

Se necesita autenticacion usable por SPA, endpoints REST y SSE.

## Opciones consideradas

### Opcion 1

JWT stateless + TOTP opcional.

### Opcion 2

Sesiones HTTP server-side.

### Opcion 3

Autenticacion delegada OAuth/OIDC.

## Decision

Usar Spring Security stateless con JWT y TOTP opcional.

## Justificacion

`JwtAuthFilter` autentica Bearer token o token query para SSE; `AuthController` implementa login, challenge 2FA y gestion de TOTP.

## Consecuencias positivas

- Compatible con SPA y SSE.
- No requiere store de sesiones.
- 2FA mejora proteccion de cuentas.

## Consecuencias negativas

- Revocacion de tokens no esta modelada.
- Token en query para SSE requiere cuidado de logs.

## Riesgos

- Defaults de desarrollo no son seguros para produccion.

## Criterios para revisar esta decision

- Si se requiere SSO, revocacion centralizada o politicas corporativas.

## Referencias al codigo

- `backend/src/main/java/com/dpswikillm/config/SecurityConfig.java`
- `backend/src/main/java/com/dpswikillm/security/JwtAuthFilter.java`
- `backend/src/main/java/com/dpswikillm/security/JwtUtil.java`
- `backend/src/main/java/com/dpswikillm/controllers/AuthController.java`

