# Calidad de seguridad

## Controles existentes

- JWT firmado con secreto base64 minimo 256 bits.
- Challenge 2FA de 5 minutos con scope separado.
- `@PreAuthorize` para registro admin.
- Validacion de paths del vault.
- CORS configurable.
- Upload Markdown limitado a 2 MB; PDF limitado por extractor.
- Web-extractor solo acepta HTTP(S).

## Riesgos

- Defaults de desarrollo en `application.yml` deben reemplazarse.
- Token SSE por query string puede quedar en logs.
- Prompts y respuestas pueden aparecer en logs segun nivel/codigo actual.
- No se detecta rate limiting.
- No se detecta politica de retencion de outputs ni snapshots.

Fuente: `JwtUtil.java`, `SecurityConfig.java`, `RawIntakeService.java`, `web-extractor/src/server.js`, `LlmMutationPlanService.java`.

