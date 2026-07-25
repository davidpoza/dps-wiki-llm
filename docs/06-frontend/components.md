# Componentes frontend

| Componente | Responsabilidad |
|---|---|
| `HomeComponent` | Shell de tabs para jobs, ingesta, chat, revision y cambios. |
| `NavComponent` | Navegacion principal responsive. |
| `JobsViewerComponent` | Estado de jobs, progreso, errores, archivos afectados y reversión. |
| `IngestComponent` | Ingesta por URL, upload PDF/Markdown y texto pegado. |
| `ReviewComponent` | Revision de candidatos de conexion. |
| `ChatComponent` | Conversaciones con contexto de knowledge base. |
| `ExplorerComponent` | Arbol del vault, editor Markdown, preview, links, imagenes, PDF y acciones de archivo. |
| `GitHistoryComponent` | Historial por snapshots, diffs y sync WebDAV. |
| `SettingsComponent` | Prompts, recursos, reindex, keywords, encolado de health-check, dedup y enlaces rotos. |
| `GraphViewComponent` | Visualizacion de grafo wiki con Cytoscape. |
| `ProfileComponent` | Password, 2FA e historial de login. |

Fuente: `frontend/src/app/components/*.ts`.
