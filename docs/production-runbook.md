# Production Runbook

This runbook describes the first production cut: manual operation from self-hosted n8n, deterministic vault writes through the local scripts, and OpenRouter for provider-switchable LLM calls.

## Runtime

- Build the n8n service from this repository's `Dockerfile`; it installs n8n from npm, installs `git`/SSH tooling plus `yt-dlp`, and copies the compiled scripts under `/app`.
- Mount the target vault at `/data/vault`.
- Let the Dockerfile build `dist/`; do not mount over `/app` at runtime.
- Configure Git identity where `commit.ts` runs. Use `git config user.name`/`git config user.email` in the vault repository, or set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL` in the runtime environment.
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
      - LLM_API_KEY_HEADER=${LLM_API_KEY_HEADER}
      - OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
      - OPENROUTER_MODEL=${OPENROUTER_MODEL}
      - OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
      - OPENROUTER_ANSWER_TEMPERATURE=0.2
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=${N8N_BLOCK_ENV_ACCESS_IN_NODE}
      - GIT_AUTHOR_NAME=${GIT_AUTHOR_NAME}
      - GIT_AUTHOR_EMAIL=${GIT_AUTHOR_EMAIL}
      - GIT_COMMITTER_NAME=${GIT_COMMITTER_NAME}
      - GIT_COMMITTER_EMAIL=${GIT_COMMITTER_EMAIL}
      - NODES_EXCLUDE=[]
    volumes:
      - ./n8n_data:/home/node/.n8n
      - ./local-files:/files
      - ${DPS_WIKI_VAULT_PATH}:/data/vault
```

The workflow command nodes already call `node /app/dist/tools/<tool>.js ...`, so they will use the scripts baked into this image.

The image intentionally uses `node:22-alpine` and installs `n8n` from npm instead of extending `n8nio/n8n:latest`, because recent official n8n images do not expose a supported package manager for adding OS tools. This keeps `git` available for `commit.ts` and `yt-dlp` available for YouTube subtitle ingestion.

The GitHub Actions workflow at `.github/workflows/docker-publish.yml` publishes the n8n image to GitHub Container Registry as `ghcr.io/<owner>/<repo>` and the runner image as `ghcr.io/<owner>/<repo>-runner`. It runs only on `main`, version tags like `v1.0.0`, and manual dispatch; pull requests do not build or publish the images.

## OpenRouter Configuration

Set these in the n8n runtime environment or equivalent secret store:

```text
OPENROUTER_API_KEY=<secret>
LLM_API_KEY_HEADER=<optional header name; defaults to Authorization>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=<optional model id>
OPENROUTER_SITE_URL=<optional site/referer>
OPENROUTER_ANSWER_TEMPERATURE=0.2
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
TELEGRAM_BOT_TOKEN=<secret>
TELEGRAM_CHAT_ID=<allowed chat id>
TELEGRAM_BOT_LOCK_TTL_MS=<optional stale-lock timeout; defaults to 1800000>
```

`OPENROUTER_MODEL` is optional so the model can be changed outside the workflow. If it is not set, OpenRouter account defaults apply. `LLM_API_KEY_HEADER` changes the request header name that carries `OPENROUTER_API_KEY`; when unset, the workflows keep the current `Authorization: Bearer <key>` behavior. When `LLM_API_KEY_HEADER` is set to a non-`Authorization` header name, the workflows send the raw API key as that header value.

Add the same OpenRouter and Telegram variables to the `n8n` service environment. The OpenRouter call nodes read `OPENROUTER_API_KEY` and `LLM_API_KEY_HEADER` from n8n HTTP Request expressions, while Code nodes still read values such as `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `OPENROUTER_SITE_URL`, `OPENROUTER_ANSWER_TEMPERATURE`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`. If your Code nodes run in the external `n8n-runner` service, pass the Code-node variables and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` there as well. Keep the Git identity variables on the service that runs `Execute Command`; in the provided workflows, `commit.ts` is run by an `Execute Command` node, so the main `n8n` service needs them.

For Telegram bot input, `KB - Telegram Bot Polling` polls Telegram with `getUpdates`. `TELEGRAM_CHAT_ID` is used as the allowed incoming chat id and as the default output chat for logs.

If you previously configured a Telegram webhook, delete it before enabling polling. Telegram does not allow `getUpdates` while a webhook is active.
Polling only needs outbound HTTPS from n8n to Telegram; n8n does not need a public inbound URL for bot input.

```sh
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

The workflows use `Execute Command` and include a disabled-by-default `Local File Trigger` blueprint. Starting with n8n 2.0, those nodes must be explicitly enabled in the main n8n service by setting `NODES_EXCLUDE=[]`.

## External Runner Image

If you run n8n with an external task runner, build the runner from `Dockerfile.runner` so the runner has the same local tooling available under `/app/dist/tools` and the JavaScript Code node packages allowed by this deployment.

Use a pinned n8n version for both images:

```yaml
services:
  n8n-runner:
    build:
      context: /path/to/dps-wiki-llm
      dockerfile: Dockerfile.runner
      args:
        N8N_RUNNERS_IMAGE: n8nio/runners:${N8N_VERSION}
    image: dps-wiki-llm-n8n-runner:${N8N_VERSION}
    environment:
      - N8N_RUNNERS_AUTH_TOKEN=${RUNNERS_AUTH_TOKEN}
      - N8N_RUNNERS_TASK_BROKER_URI=http://n8n:5679
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=${N8N_BLOCK_ENV_ACCESS_IN_NODE}
      - OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
      - OPENROUTER_MODEL=${OPENROUTER_MODEL}
      - OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
      - OPENROUTER_ANSWER_TEMPERATURE=0.2
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
      - GIT_AUTHOR_NAME=${GIT_AUTHOR_NAME}
      - GIT_AUTHOR_EMAIL=${GIT_AUTHOR_EMAIL}
      - GIT_COMMITTER_NAME=${GIT_COMMITTER_NAME}
      - GIT_COMMITTER_EMAIL=${GIT_COMMITTER_EMAIL}
    volumes:
      - ${DPS_WIKI_VAULT_PATH}:/data/vault
```

The runner image installs `axios` and `qs` for JavaScript Code nodes, keeps both JavaScript and Python runner entries in `/etc/n8n-task-runners.json`, and copies the compiled scripts to `/app/dist/tools`. It does not install OS packages like `git` because the official `n8nio/runners` image does not expose a supported OS package manager.

If an `Execute Command` node still runs in the main n8n service or in a queue worker, that service also needs the repository `Dockerfile` image and the same vault mount.

## Initial Bootstrap

1. Import all JSON files from `n8n/workflows/`.
2. Leave every workflow inactive.
3. Run `KB - Reindex Wiki` manually to initialize and rebuild `state/kb.db`.
4. Run `KB - Weekly Lint` and `KB - Monthly Health Check` manually to inspect structural and traceability findings.
5. Do not activate scheduled maintenance until manual runs are clean enough for unattended reports.

## Telegram Bot Flow

Run `KB - Telegram Bot Polling` manually with a question payload or activate it to poll Telegram once per minute.

The workflow:

- accepts manual input or one Telegram `getUpdates` item
- acquires an atomic filesystem lock under `state/locks/` before processing a polled Telegram update, preventing overlapping schedule cycles from running multiple bot tasks concurrently
- routes `/ask`, `/answer`, `/query`, and free text to the answer path
- runs `search.ts`, `answer-context.ts`, `answer-record.ts`, and feedback validation for answers
- routes `/ingest <youtube-url>` to `youtube-transcript.ts`
- writes `yt-dlp`-fetched YouTube subtitles to `raw/web/**` before running the normal ingest pipeline
- sends Telegram logs for answer output, completed ingest, and handled ingest failures such as videos without subtitles

The answer path does not update `wiki/`. The `/ingest` path mutates `raw/**` first, then runs the controlled ingest pipeline that updates `wiki/**`, reindexes, and commits.
If an execution crashes before releasing the bot lock, the next poll will resume after `TELEGRAM_BOT_LOCK_TTL_MS` expires. The default is 30 minutes.

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
- calls OpenRouter to clean the source content into a structured `source_note`
- validates that the LLM source note includes non-empty `summary` and `raw_context`
- builds the baseline source note plan with `plan-source-note.ts`
- applies and commits that LLM-cleaned source note baseline
- calls OpenRouter for an optional richer Mutation Plan
- validates the LLM plan with guardrails
- links grounded concept/entity/topic/analysis updates back to the baseline source note through `Sources`
- allows only a narrow backlink update to the exact baseline source note `Linked Notes` section
- applies non-empty LLM plans with `apply-update.ts`
- reindexes and creates a second commit for applied LLM changes
- sends a Telegram ingest log when Telegram env is configured
- returns `openrouter_source_note_meta`, `llm_mutation_plan`, `llm_guardrail_rejections`, `llm_plan_auto_apply_required`, `llm_mutation_result`, and `llm_commit_result`

If the source-note cleaner fails or returns invalid JSON, the workflow fails before mutating `wiki/`.

If the LLM plan is empty, the workflow stops after the baseline commit and returns `baseline_ingest_applied_no_llm_changes`. If the plan includes unsafe actions, the workflow converts those actions to `noop`, reports them in `llm_guardrail_rejections`, and applies only the remaining safe changes.

## Safety Checks

- Never activate a workflow that watches `wiki/**`.
- Keep the raw watcher in `KB - Ingest Raw OpenRouter Manual` inactive until WebDAV sync behavior is validated.
- Do not store `OPENROUTER_API_KEY` in workflow JSON, markdown notes, or committed files.
- Treat every LLM-generated source note and Mutation Plan as untrusted; the workflow validates shape before writes and guardrails the applied mutation plan.
- Use `KB - Apply Feedback` for approved feedback propagation so `feedback-record.ts`, `apply-update.ts`, `reindex.ts`, and `commit.ts` preserve traceability.
