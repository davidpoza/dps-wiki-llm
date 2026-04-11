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
  - runs `search.ts`, reads the top-k wiki markdown through `answer-context.ts`, and prepares the packet that your LLM node should consume
  - after your LLM node, call `answer-record.ts` with `{ answer_record, answer }`
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
  - runs `ingest-source.ts`, then uses `plan-source-note.ts` as a deterministic baseline planner for creating the source note
  - replace `plan-source-note.ts` with your provider-specific LLM planner when ingestion should also update concepts, entities, topics, or analyses

## Recommended Topology

Keep the orchestration split into small workflows instead of one large graph:

1. `KB - Ingest Raw Blueprint`
   - reacts only to `raw/**`
   - normalizes the event
   - creates the source-note baseline plan
   - can swap in your LLM planner for richer wiki mutations

2. `KB - Answer Blueprint`
   - retrieves wiki context
   - reads the retrieved wiki docs into a bounded context packet
   - prepares the answer packet and answer-record shell for the LLM
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
- The ingest blueprint is runnable for the safe source-note baseline. A richer ingestion planner still needs your provider-specific LLM node.
- The answer blueprint stops at the provider-neutral LLM request because answer synthesis and feedback classification depend on your LLM provider.
- The critical boundary remains the same as in `AGENTS.md`: only watch `raw/**`; never auto-trigger on `wiki/**`.
