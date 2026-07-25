# Integracion con modelos

## Chat completions

`OpenAiCompatibleLlmClient` construye un `RestClient` con `app.llm.base-url` y llama a:

```text
POST /chat/completions
Authorization: Bearer <LLM_API_KEY>
```

El body contiene:

```json
{
  "model": "<LLM_MODEL>",
  "messages": [],
  "response_format": { "type": "json_object" }
}
```

`response_format` solo se incluye cuando el servicio llama a `chatJson`.

Timeouts:

- conexion: 10s;
- lectura: 120s.

## Embeddings

`OpenAiCompatibleEmbeddingClient` no usa el endpoint OpenAI-compatible `/embeddings`; usa el endpoint nativo TEI `/embed` porque soporta `truncate: true`.

Timeouts:

- conexion: 5s;
- lectura: 30s.

## Reintentos

`RetryingLlmExecutor` reintenta hasta 3 intentos con backoff 200ms, 400ms. Se reutiliza para:

- errores de transporte marcados como retryable;
- errores de formato LLM en operaciones generate-and-parse.

Errores HTTP retryable:

- `429`;
- `5xx`.

Fuente: `OpenAiCompatibleLlmClient.java`, `OpenAiCompatibleEmbeddingClient.java`, `RetryingLlmExecutor.java`, `LlmClientException.java`.

