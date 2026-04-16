# n8n Workflows

This directory contains importable n8n workflow JSON files aligned with the scripts in this repository.

## Assumptions

- repository scripts available inside the n8n container at `/app`
- for Docker Compose, build the `n8n` service from the repository `Dockerfile`; the image installs n8n from npm, installs `git` and `yt-dlp`, and builds `dist/` during `docker compose build`
- Obsidian vault mounted inside the n8n container at `/data/vault`
- `Execute Command` enabled in self-hosted n8n
- `Local File Trigger` enabled in self-hosted n8n if you want reactive ingestion from `raw/`
- `LLM_API_KEY` configured in the runtime that executes `Execute Command` nodes
- `LLM_BASE_URL` configured for the OpenAI-compatible provider
- optional `LLM_API_KEY_HEADER` configured in that same command runtime when the provider expects the raw API key in a header other than `Authorization`
- optional `LLM_MODEL` configured when you want to pin a model
- optional `LOG_LEVEL` to control log verbosity (`info` by default; set to `debug` to record full LLM prompts and responses in `state/logs/app.log`)
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` configured when you want answer input/output and ingest logs over Telegram

If your paths differ, update the command strings and watched paths after importing.

The workflow command nodes use `node /app/dist/tools/<tool>.js ...` so stdout remains parseable JSON.

For Docker Compose deployments, build the `n8n` service from the repository `Dockerfile`. The image installs n8n plus the compiled scripts into `/app`, so the workflows can find them without a bind mount over `/app`.

The compact workflows do not contain provider-specific LLM HTTP Request nodes. `answer-run.ts` and `ingest-run.ts` read the LLM runtime configuration directly from the command environment and call an OpenAI-compatible chat completions endpoint. If the provider needs a different API-key header, set `LLM_API_KEY_HEADER` in the service that executes the command nodes; keep it unset or set to `Authorization` for the default `Authorization: Bearer <LLM_API_KEY>` behavior.

The production V1 runbook lives in [`../docs/production-runbook.md`](../docs/production-runbook.md).

## Included Workflows

- `workflows/kb-reindex-wiki.json`
  - runnable
  - initializes `state/kb.db` and rebuilds the FTS index

- `workflows/kb-answer-blueprint.json`
  - runnable scheduled/manual Telegram bot workflow
  - polls Telegram with `getUpdates` and routes `/ask`, `/answer`, `/query`, and `/ingest`
  - acquires a short-lived filesystem Telegram bot lock before routing a polled update, so overlapping schedule cycles do not process concurrent bot tasks
  - answer route delegates retrieval, answer synthesis, answer persistence, and feedback validation to `answer-run.ts`
  - ingest route accepts `/ingest <youtube-url>` and delegates YouTube subtitle extraction plus the normal ingest pipeline to `ingest-run.ts`
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
  - runnable manual LLM workflow
  - shows the orchestration for `raw/**` ingestion
  - delegates source normalization, LLM source-note cleanup, baseline source-note creation, optional guarded LLM propagation, reindexing, and commits to `ingest-run.ts`
  - sends a Telegram ingest log when Telegram env is configured

## Recommended Topology

Keep the orchestration split into small workflows instead of one large graph:

1. `KB - Ingest Raw LLM Manual`
   - runs manually in V1; only activate the raw watcher after WebDAV behavior is validated
   - delegates the event to `ingest-run.ts`
   - `ingest-run.ts` cleans the source note content through the LLM provider before mutating `wiki/`
   - `ingest-run.ts` creates and commits the source-note baseline plan
   - `ingest-run.ts` proposes richer wiki mutations through the LLM provider and applies safe non-empty plans with source/concept links

2. `KB - Telegram Bot Polling`
   - receives bot commands through outbound `getUpdates` polling
   - routes `/ask`, `/answer`, `/query`, and free text into the answer path
   - routes `/ingest <youtube-url>` into `ingest-run.ts`, which handles `yt-dlp`-backed YouTube subtitle extraction, raw artifact creation, and the normal ingest pipeline
   - uses `state/locks/telegram-bot.lock` as a bot lock; set `TELEGRAM_BOT_LOCK_TTL_MS` to override the default 30 minute stale-lock timeout
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
- LLM API keys must live in the command runtime environment or credentials, not in exported workflow JSON.
- Telegram bot tokens must live in n8n environment or credentials, not in exported workflow JSON.
- Telegram bot input uses outbound `getUpdates` polling; delete any active Telegram webhook for the bot before activating the polling workflow.
- The critical boundary remains the same as in `AGENTS.md`: only watch `raw/**`; never auto-trigger on `wiki/**`.
