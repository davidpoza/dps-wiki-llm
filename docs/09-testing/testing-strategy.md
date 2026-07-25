# Estrategia de pruebas

El repositorio tiene pruebas automatizadas para backend y web-extractor. No se detectan specs frontend versionadas.

## Piramide observada

| Nivel | Estado |
|---|---|
| Unit/service tests backend | Amplia cobertura de servicios criticos. |
| Controller/security tests backend | Cobertura de auth y arranque. |
| Integration/E2E parcial backend | Pruebas de merge/revert/snapshots con fixtures/stubs. |
| Microservice tests web-extractor | Node test runner con fixtures HTML/PDF/VTT/XML. |
| Frontend tests | Script `ng test` existe, pero no se detectan `*.spec.ts`. |
| E2E navegador | No se detecta Playwright/Cypress de frontend. |

## Comandos

```bash
cd backend
mvn test
```

```bash
cd frontend
pnpm lint
pnpm build
pnpm test
```

```bash
cd web-extractor
npm test
```

Fuente: `backend/pom.xml`, `frontend/package.json`, `web-extractor/package.json`, `backend/src/test/**`, `web-extractor/test/**`.

