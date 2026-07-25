# Glosario

| Termino | Significado en este proyecto |
|---|---|
| Vault | Directorio montado que contiene `raw/`, `wiki/`, `outputs/`, `state/` e `INDEX.md`. Configurado con `VAULT_PATH`. |
| Raw | Capa de eventos de entrada. La ingesta normaliza artefactos bajo `raw/**`. |
| Wiki | Estado curado y derivado. Es la unica capa indexada para respuesta semantica. |
| Source note | Nota normalizada bajo `wiki/sources/**` que representa una fuente original. |
| Concept | Nota atomica bajo `wiki/concepts/**`. |
| Topic | Pagina agregadora bajo `wiki/topics/**`. Solo puede ser creada manualmente. |
| MutationPlan | Contrato interno con `page_actions` para crear, actualizar o no operar sobre notas wiki. |
| Guardrail | Validacion que rechaza acciones inseguras antes de mutar el vault. |
| Idempotency ledger | Archivo `state/runtime/idempotency-keys.json` usado para no repetir mutaciones aplicadas. |
| Snapshot | Registro en PostgreSQL de contenido antes/despues por archivo para historial y reversión. |
| TEI | Hugging Face Text Embeddings Inference, ejecutado como sidecar para `multilingual-e5-small`. |
| HNSW | Indice aproximado de pgvector usado para ordenar por distancia coseno. |
| SSE | Server-Sent Events usados para progreso global de jobs y para tareas manuales como reindex, enlaces rotos y sync. |

Fuente: `AGENTS.md`, `backend/src/main/java/com/dpswikillm/domain/**`, `backend/src/main/resources/db/migration/**`.
