<div align="center">
  <img src="docs/assets/logo.svg" alt="dps-wiki-llm logo" width="132">
  <h1>dps-wiki-llm</h1>
  <p><strong>Tooling determinista en Node.js para mantener un wiki persistente basado en markdown.</strong></p>
  <p><code>raw/</code> para eventos, <code>wiki/</code> para conocimiento derivado, <code>state/</code> para indices y <code>outputs/</code> para artefactos.</p>
</div>

## Resumen

`dps-wiki-llm` implementa el nucleo operativo de un sistema de conocimiento persistente basado en el modelo `raw -> wiki -> state -> outputs`. La idea no es responder como un chat con memoria improvisada, sino mantener notas reutilizables, trazables y actualizables con reglas explicitas.

El repositorio actual contiene el tooling base para aplicar mutation plans y registrar feedback auditable. El vault vive fuera de este repo o montado localmente; este repo aloja los scripts que operan sobre ese vault.

## Principios

- Separacion estricta entre `raw/` y `wiki/`.
- Ingesta reactiva solo sobre `raw/**`.
- Mutaciones pequenas, deterministas e idempotentes.
- JSON como contrato canonico entre orquestacion y scripts.
- Markdown como estado durable y SQLite FTS como capa de busqueda.
- La propagacion desde respuestas es condicional y siempre auditable.

## Estado actual

Scripts disponibles hoy:

- `tools/apply-update.mjs`: consume un Mutation Plan JSON, crea o actualiza notas markdown y registra claves de idempotencia en `state/runtime/idempotency-keys.json`.
- `tools/feedback-record.mjs`: normaliza un Feedback Record, escribe artefactos en `state/feedback/` y puede derivar un mutation plan cuando la decision es `propagate`.
- `tools/lib/*.mjs`: utilidades internas para CLI, filesystem, frontmatter y composicion de markdown.

Componentes descritos en la arquitectura pero todavia no implementados aqui:

- `init-db.mjs`
- `ingest-source.mjs`
- `reindex.mjs`
- `search.mjs`
- `lint.mjs`
- `health-check.mjs`
- `commit.mjs`

## Estructura del repo

```text
.
├── README.md
├── package.json
├── docs/
│   ├── assets/
│   │   └── logo.svg
│   └── diagrams/
│       ├── workflow.puml
│       └── workflow.svg
└── tools/
    ├── apply-update.mjs
    ├── feedback-record.mjs
    └── lib/
```

Vault esperado por la arquitectura:

```text
vault/
├── raw/
├── wiki/
├── state/
└── outputs/
```

## Workflow objetivo

El siguiente diagrama resume el workflow objetivo del sistema. En verde aparecen scripts ya presentes en este repo; en amarillo, componentes previstos en la arquitectura pero aun pendientes.

Render generado desde la web oficial de PlantUML:

![Workflow dps-wiki-llm](docs/diagrams/workflow.svg)

Fuente canonica: [`docs/diagrams/workflow.puml`](docs/diagrams/workflow.puml)  
Render versionado: [`docs/diagrams/workflow.svg`](docs/diagrams/workflow.svg)

## Uso rapido

Requisitos:

- Node.js 20 o superior

Ejecutar un mutation plan:

```bash
npm run apply-update -- --vault /ruta/al/vault --input ./plan.json
```

Registrar una decision de feedback:

```bash
npm run feedback-record -- --vault /ruta/al/vault --input ./feedback.json
```

Ambos scripts:

- aceptan JSON por `--input` o `stdin`
- responden con JSON machine-readable
- resuelven rutas dentro del vault para evitar escrituras fuera de raiz

## Contratos operativos

- `apply-update.mjs` espera el contrato `Mutation Plan`.
- `feedback-record.mjs` espera el contrato `Feedback Record`.
- Si la decision es `propagate`, `feedback-record.mjs` genera un mutation plan reutilizable por `apply-update.mjs`.

## Regla critica

Nunca dispares automatizaciones sobre `wiki/**`. El limite correcto es:

```text
raw/  = event stream reactivo
wiki/ = estado derivado y estable
```

Romper esa separacion introduce bucles, ruido y actualizaciones no deterministas.
