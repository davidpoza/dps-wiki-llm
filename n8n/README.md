# n8n Workflows

This directory contains importable n8n workflow JSON files aligned with the scripts in this repository.

## Assumptions

- repository scripts available inside the n8n container at `/app`
- for Docker Compose, build the `n8n` service from the repository `Dockerfile`; the image installs n8n from npm, installs `git`, and builds `dist/` during `docker compose build`
- Obsidian vault mounted inside the n8n container at `/data/vault`
- `Execute Command` enabled in self-hosted n8n
- `Local File Trigger` enabled in self-hosted n8n if you want reactive ingestion from `raw/`
- `OPENROUTER_API_KEY` configured in the n8n runtime for OpenRouter calls
- optional `OPENROUTER_MODEL` configured when you want to pin a model instead of using OpenRouter account defaults

If your paths differ, update the command strings and watched paths after importing.

The workflow command nodes use `node /app/dist/tools/<tool>.js ...` so stdout remains parseable JSON.

For Docker Compose deployments, build the `n8n` service from the repository `Dockerfile`. The image installs n8n plus the compiled scripts into `/app`, so the workflows can find them without a bind mount over `/app`.

The production V1 runbook lives in [`../docs/production-runbook.md`](../docs/production-runbook.md).

## Included Workflows

- `workflows/kb-reindex-wiki.json`
  - runnable
  - initializes `state/kb.db` and rebuilds the FTS index

- `workflows/kb-answer-blueprint.json`
  - runnable manual OpenRouter workflow
  - runs `search.ts`, reads the top-k wiki markdown through `answer-context.ts`, calls OpenRouter for answer synthesis, and writes the answer via `answer-record.ts`
  - calls OpenRouter again for a proposed Feedback Record and validates it with `feedback-record.ts --no-write`
  - returns an `approval_payload` for manual review; it does not mutate `wiki/`

- `workflows/kb-weekly-lint.json`
  - runnable
  - schedule plus manual trigger for `lint.ts`

- `workflows/kb-monthly-health-check.json`
  - runnable
  - schedule plus manual trigger for `health-check.ts`

- `workflows/kb-apply-feedback.json`
  - runnable
  - webhook or manual trigger
  - records feedback, propagates only when `approved=true`, reindexes, and commits

- `workflows/kb-ingest-raw-blueprint.json`
  - runnable manual OpenRouter workflow
  - shows the orchestration for `raw/**` ingestion
  - runs `ingest-source.ts`, calls OpenRouter to clean the source note content, then uses `plan-source-note.ts` to create and commit the source note
  - calls OpenRouter for an optional richer Mutation Plan and auto-applies non-empty plans after guardrail validation

## Recommended Topology

Keep the orchestration split into small workflows instead of one large graph:

1. `KB - Ingest Raw OpenRouter Manual`
   - runs manually in V1; only activate the raw watcher after WebDAV behavior is validated
   - normalizes the event
   - cleans the source note content through OpenRouter before mutating `wiki/`
   - creates and commits the source-note baseline plan
   - proposes richer wiki mutations through OpenRouter and applies safe non-empty plans

2. `KB - Answer OpenRouter Manual`
   - retrieves wiki context
   - reads the retrieved wiki docs into a bounded context packet
   - calls OpenRouter for answer synthesis and feedback classification
   - does not mutate the wiki

3. `KB - Apply Feedback`
   - receives a canonical feedback record
   - requires `approved=true` before propagation
   - applies updates, reindexes, and commits

4. `KB - Weekly Lint`
   - structural maintenance

5. `KB - Monthly Health Check`
   - semantic and traceability maintenance

6. `KB - Reindex Wiki`
   - manual repair or bootstrap workflow

## Notes

- The maintenance workflows write reports under `state/maintenance/` by default.
- The feedback workflow writes artifacts under `state/feedback/`.
- Keep every workflow inactive for the first production cut and run them manually from n8n.
- OpenRouter API keys must live in n8n environment or credentials, not in exported workflow JSON.
- The critical boundary remains the same as in `AGENTS.md`: only watch `raw/**`; never auto-trigger on `wiki/**`.
