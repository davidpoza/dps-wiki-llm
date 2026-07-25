# Troubleshooting

| Sintoma | Revisar |
|---|---|
| Login no funciona tras reinicio | `JWT_SECRET` cambia si esta vacio; configurar secreto estable. Fuente: `JwtUtil.java`. |
| No existe usuario admin | `ADMIN_USERNAME`/`ADMIN_PASSWORD` vacios hacen que `seedAdmin` se salte. Fuente: `UserService.java`. |
| Ingesta URL falla | Estado de `web-extractor`, endpoint `/health`, `EXTRACTOR_BASE_URL`, errores `WebExtractionException`. |
| Embeddings fallan | Health de `embeddings`, `EMBED_BASE_URL`, dimension `EMBED_DIMENSION`, logs de `OpenAiCompatibleEmbeddingClient`. |
| Respuestas sin evidencia | Reindex/embeddings pendientes o `wiki/**` vacio. Ejecutar reindex/health-check desde Settings. |
| SSE no conecta | Pasar token en query string o revisar nginx buffering/timeouts. Fuente: `JwtAuthFilter.java`, `docker/nginx.conf`. |
| Export PDF falla | Backend fuera de Docker necesita `pandoc` y `weasyprint`. Fuente: `FileService.exportPdf`, `backend/Dockerfile`. |
| WebDAV devuelve conflicto | Usar `/api/webdav/conflicts` y resolver con `LOCAL`, `REMOTE`, `SKIP` o `MANUAL`. |
| Markdown upload rechazado | Limite 2 MB y content-type permitido. Fuente: `RawIntakeService.java`. |

