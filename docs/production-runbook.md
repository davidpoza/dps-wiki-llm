# Production Runbook

This runbook describes the first production cut: manual operation from self-hosted n8n, deterministic vault writes through the local scripts, and OpenRouter for provider-switchable LLM calls.

## Runtime

- Build the n8n service from this repository's `Dockerfile`; it installs n8n from npm, installs `git`/SSH tooling, and copies the compiled scripts under `/app`.
- Mount the target vault at `/data/vault`.
- Let the Dockerfile build `dist/`; do not mount over `/app` at runtime.
- Configure Git identity in the environment where `commit.ts` runs.
- Keep imported workflows inactive for V1; use manual n8n executions while validating behavior.

For the compose file you shared, replace the `n8n` service image line with a local build and add the vault mount:

```yaml
services:
  n8n:
    build:
      context: /path/to/dps-wiki-llm
      dockerfile: Dockerfile
      args:
        N8N_VERSION: latest
    image: dps-wiki-llm-n8n:local
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
      - OPENROUTER_MODEL=${OPENROUTER_MODEL}
      - OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
      - OPENROUTER_ANSWER_TEMPERATURE=0.2
    volumes:
      - ./n8n_data:/home/node/.n8n
      - ./local-files:/files
      - ${DPS_WIKI_VAULT_PATH}:/data/vault
```

The workflow command nodes already call `npm --silent --prefix /app run ...`, so they will use the scripts baked into this image.

The image intentionally uses `node:22-alpine` and installs `n8n` from npm instead of extending `n8nio/n8n:latest`, because recent official n8n images do not expose a supported package manager for adding OS tools. This keeps `git` available for `commit.ts`.

The GitHub Actions workflow at `.github/workflows/docker-publish.yml` publishes the same image to GitHub Container Registry as `ghcr.io/<owner>/<repo>`. It runs only on `main`, version tags like `v1.0.0`, and manual dispatch; pull requests do not build or publish the image.

## OpenRouter Configuration

Set these in the n8n runtime environment or equivalent secret store:

```text
OPENROUTER_API_KEY=<secret>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=<optional model id>
OPENROUTER_SITE_URL=<optional site/referer>
OPENROUTER_ANSWER_TEMPERATURE=0.2
```

`OPENROUTER_MODEL` is optional so the model can be changed outside the workflow. If it is not set, OpenRouter account defaults apply.

Add the same OpenRouter variables to the `n8n` service environment. If your Code nodes run in the external `n8n-runner` service, also pass `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `OPENROUTER_SITE_URL`, and `OPENROUTER_ANSWER_TEMPERATURE` there so Code nodes see the same runtime configuration.

## Initial Bootstrap

1. Import all JSON files from `n8n/workflows/`.
2. Leave every workflow inactive.
3. Run `KB - Reindex Wiki` manually to initialize and rebuild `state/kb.db`.
4. Run `KB - Weekly Lint` and `KB - Monthly Health Check` manually to inspect structural and traceability findings.
5. Do not activate scheduled maintenance until manual runs are clean enough for unattended reports.

## Answer Flow

Run `KB - Answer OpenRouter Manual` manually with a question payload or pinned input.

The workflow:

- runs `search.ts`
- reads bounded wiki context with `answer-context.ts`
- calls OpenRouter for answer synthesis
- writes the answer with `answer-record.ts`
- calls OpenRouter again for a proposed Feedback Record
- validates that feedback with `feedback-record.ts --no-write`
- returns an `approval_payload`

The workflow does not update `wiki/`.

## Feedback Application

Run `KB - Apply Feedback` manually only after reviewing the proposed feedback.

For propagation, the input must include:

```json
{
  "approved": true,
  "feedback": {
    "output_id": "out-example",
    "decision": "propagate",
    "reason": "Grounded reusable update",
    "source_refs": ["wiki/concepts/example.md"],
    "candidate_items": [
      {
        "item_id": "item-001",
        "target_note": "wiki/concepts/example.md",
        "change_type": "better_wording",
        "novelty": "better_wording",
        "source_support": ["wiki/concepts/example.md"],
        "proposed_content": "Clarify the reusable point with grounded wording.",
        "outcome": "applied"
      }
    ],
    "affected_notes": ["wiki/concepts/example.md"]
  }
}
```

If `decision` is `propagate` and `approved` is not `true`, the workflow fails before `feedback-record.ts`, `apply-update.ts`, `reindex.ts`, or `commit.ts` can run.

## Ingest Flow

Run `KB - Ingest Raw OpenRouter Manual` manually while V1 is stabilizing.

The workflow:

- normalizes a `raw/**` path with `ingest-source.ts`
- builds the baseline source note plan with `plan-source-note.ts`
- applies and commits that deterministic source note baseline
- calls OpenRouter for an optional richer Mutation Plan
- returns `llm_mutation_plan` and `llm_plan_approval_required`

The LLM ingest plan is not applied by this workflow. Review it, save it as an approved plan if needed, then apply it manually with the deterministic scripts.

## Safety Checks

- Never activate a workflow that watches `wiki/**`.
- Keep the raw watcher in `KB - Ingest Raw OpenRouter Manual` inactive until WebDAV sync behavior is validated.
- Do not store `OPENROUTER_API_KEY` in workflow JSON, markdown notes, or committed files.
- Treat every LLM-generated Mutation Plan as untrusted until reviewed.
- Use `KB - Apply Feedback` for approved feedback propagation so `feedback-record.ts`, `apply-update.ts`, `reindex.ts`, and `commit.ts` preserve traceability.
