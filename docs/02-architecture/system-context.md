# Contexto del sistema

## Diagrama C4 - Contexto

```mermaid
flowchart TB
  user[Usuario web autenticado]
  admin[Administrador]
  telegramUser[Usuario Telegram autorizado]
  llm[Proveedor LLM OpenAI-compatible]
  tei[TEI embeddings sidecar]
  web[Web publica, PDF, YouTube, PubMed/PMC]
  webdav[Repositorio WebDAV opcional]
  system[dps-wiki-llm]

  user -->|Ingesta, chat, edicion, revision| system
  admin -->|Registro de usuarios, configuracion| system
  telegramUser -->|/ask, /ingest| system
  system -->|chat completions| llm
  system -->|/embed| tei
  system -->|extrae contenido| web
  system <-->|sincroniza markdown| webdav
```

## Limites externos

| Externo | Contrato observado |
|---|---|
| LLM OpenAI-compatible | `POST /chat/completions` con `model`, `messages` y opcional `response_format`. |
| TEI | `POST /embed` con `inputs`, `truncate: true`, `normalize: true`. |
| Telegram Bot API | `sendMessage` y long polling a traves de `telegrambots-springboot-longpolling-starter`. |
| WebDAV | `PROPFIND`, `GET`, `PUT`, `DELETE`, `MOVE` encapsulados en `WebDavClient`. |
| Web | `web-extractor` navega URLs HTTP(S), detecta PDF/YouTube/NCBI y devuelve markdown. |

Fuente: `OpenAiCompatibleLlmClient.java`, `OpenAiCompatibleEmbeddingClient.java`, `WikiBotService.java`, `WebDavSyncService.java`, `web-extractor/src/server.js`.

