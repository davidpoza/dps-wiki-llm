# n8n Workflows

This directory contains importable n8n workflow JSON files aligned with the scripts in this repository.

## Assumptions

- repository mounted inside the n8n container at `/app`
- repository dependencies installed under `/app` with `npm install`, which builds `dist/`
- Obsidian vault mounted inside the n8n container at `/data/vault`
- `Execute Command` enabled in self-hosted n8n
- `Local File Trigger` enabled in self-hosted n8n if you want reactive ingestion from `raw/`

If your paths differ, update the command strings and watched paths after importing.

The workflow command nodes use `npm --silent --prefix /app run ...` so stdout remains parseable JSON.

## Included Workflows

- `workflows/kb-reindex-wiki.json`
  - runnable
  - initializes `state/kb.db` and rebuilds the FTS index

- `workflows/kb-answer-blueprint.json`
  - blueprint
  - webhook or manual trigger
  - runs `search.ts`, returns top-k wiki context, and prepares the packet that your LLM node should consume
  - keeps answer generation separate from feedback propagation

- `workflows/kb-weekly-lint.json`
  - runnable
  - schedule plus manual trigger for `lint.ts`

- `workflows/kb-monthly-health-check.json`
  - runnable
  - schedule plus manual trigger for `health-check.ts`

- `workflows/kb-apply-feedback.json`
  - runnable
  - webhook or manual trigger
  - records feedback, propagates if approved, reindexes, and commits

- `workflows/kb-ingest-raw-blueprint.json`
  - blueprint
  - shows the orchestration for `raw/**` ingestion
  - requires replacing the placeholder planner node with your real `ingest-source` plus LLM planning step

## Recommended Topology

Keep the orchestration split into small workflows instead of one large graph:

1. `KB - Ingest Raw Blueprint`
   - reacts only to `raw/**`
   - normalizes the event
   - calls your planner

2. `KB - Answer Blueprint`
   - retrieves wiki context
   - prepares the answer packet for the LLM
   - does not mutate the wiki

3. `KB - Apply Feedback`
   - receives a canonical feedback record
   - decides whether to propagate
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
- The ingest and answer blueprints intentionally do not hide the planner or LLM step inside fake automation. You should wire your provider-specific AI node into those gaps explicitly.
- The critical boundary remains the same as in `AGENTS.md`: only watch `raw/**`; never auto-trigger on `wiki/**`.
