# Unit tests

## Backend

Cobertura destacada:

- path traversal y normalizacion: `VaultPathResolverTests`;
- markdown merge/frontmatter/PDF preprocessing: `MarkdownServiceTests`, `FileServiceTests`;
- idempotencia y topics prohibidos: `MutationApplierTests`, `MutationGuardrailServiceTests`;
- parsing y retry de IA: `JsonExtractionServiceTests`, `RetryingLlmExecutorTests`;
- servicios de IA: `SourceNoteLlmServiceTests`, `KeywordGenerationServiceTests`;
- seguridad: `JwtUtilTests`, `TotpServiceTests`, `UserServiceTests`.

## Web-extractor

Usa `node --test` con `assert` nativo:

- `extract.test.js` cubre HTML y PDF;
- `server.test.js` cubre rutas y errores;
- `youtube.test.js` cubre URLs y transcripciones;
- `ncbi.test.js` cubre PubMed/PMC fixtures.

Fuente: `backend/src/test/java/com/dpswikillm/**`, `web-extractor/test/**`.

