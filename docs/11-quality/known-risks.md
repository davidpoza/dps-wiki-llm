# Riesgos conocidos

| Riesgo | Severidad | Mitigacion actual |
|---|---|---|
| Corrupcion del vault por mutaciones IA incorrectas | Alta | Guardrails, snapshots, review mode. |
| Bucles si alguien automatiza triggers sobre `wiki/**` | Alta | Regla documentada y `SourceNormalizer` exige `raw/**`. |
| Perdida de acceso por JWT_SECRET efimero | Media | Warning en logs; configurar secreto. |
| Desalineacion `EMBED_DIMENSION` vs modelo | Alta | Placeholder Flyway y config central, pero requiere disciplina. |
| Conflictos WebDAV | Media | Baseline y UI/API de resolucion. |
| Costes/latencia LLM no observados | Media | Reintentos/timeouts; no hay metricas. |
| Extraccion web bloqueada por sitios externos | Media | Browser real, NCBI/PDF/YouTube rutas especializadas, errores tipados. |

Fuente: `AGENTS.md`, servicios de IA, WebDAV y extractor.

