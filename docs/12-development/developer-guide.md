# Guia del desarrollador

## Antes de modificar

1. Identificar si el cambio toca `raw/**`, `wiki/**`, indices, jobs o UI.
2. Mantener controladores delgados y mover logica a servicios.
3. Si hay escritura en vault, usar `VaultPathResolver` y considerar snapshot.
4. Si hay mutacion automatica de wiki, pasar por guardrails e idempotencia.
5. Si se modifica IA, actualizar prompts/migraciones y tests de parsing.
6. Si se cambia embedding dimension, planificar migracion DB y reindex completo.

## Comandos utiles

```bash
cd backend
mvn test
```

```bash
cd frontend
pnpm lint
pnpm build
```

```bash
cd web-extractor
npm test
```

Fuente: `backend/pom.xml`, `frontend/package.json`, `web-extractor/package.json`.

