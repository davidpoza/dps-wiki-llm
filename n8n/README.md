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
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` configured when you want answer input/output and ingest logs over Telegram

If your paths differ, update the command strings and watched paths after importing.

The workflow command nodes use `node /app/dist/tools/<tool>.js ...` so stdout remains parseable JSON.

For Docker Compose deployments, build the `n8n` service from the repository `Dockerfile`. The image installs n8n plus the compiled scripts into `/app`, so the workflows can find them without a bind mount over `/app`.

The production V1 runbook lives in [`../docs/production-runbook.md`](../docs/production-runbook.md).

## Included Workflows

- `workflows/kb-reindex-wiki.json`
  - runnable
  - initializes `state/kb.db` and rebuilds the FTS index

- `workflows/kb-answer-blueprint.json`
  - runnable scheduled/manual Telegram bot workflow
  - polls Telegram with `getUpdates` and routes `/ask`, `/answer`, `/query`, and `/ingest`
  - answer route runs `search.ts`, reads the top-k wiki markdown through `answer-context.ts`, calls OpenRouter for answer synthesis, and writes the answer via `answer-record.ts`
  - ingest route accepts `/ingest <youtube-url>`, extracts YouTube captions through `youtube-transcript.ts`, creates a `raw/web/**` artifact, and runs the normal ingest pipeline
  - sends Telegram logs for answer output, completed ingest, and handled ingest failures such as videos without subtitles

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
  - calls OpenRouter for an optional richer Mutation Plan and auto-applies non-empty plans after guardrail validation, including narrow source-note `Linked Notes` backlinks
  - sends a Telegram ingest log when Telegram env is configured

## Recommended Topology

Keep the orchestration split into small workflows instead of one large graph:

1. `KB - Ingest Raw OpenRouter Manual`
   - runs manually in V1; only activate the raw watcher after WebDAV behavior is validated
   - normalizes the event
   - cleans the source note content through OpenRouter before mutating `wiki/`
   - creates and commits the source-note baseline plan
   - proposes richer wiki mutations through OpenRouter and applies safe non-empty plans with source/concept links

2. `KB - Telegram Bot Polling`
   - receives bot commands through outbound `getUpdates` polling
   - routes `/ask`, `/answer`, `/query`, and free text into the answer path
   - routes `/ingest <youtube-url>` into YouTube transcript extraction, raw artifact creation, and the normal ingest pipeline
   - sends answer, ingest success, and ingest failure logs back to Telegram when configured

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
- Telegram bot tokens must live in n8n environment or credentials, not in exported workflow JSON.
- Telegram bot input uses outbound `getUpdates` polling; delete any active Telegram webhook for the bot before activating the polling workflow.
- The critical boundary remains the same as in `AGENTS.md`: only watch `raw/**`; never auto-trigger on `wiki/**`.
