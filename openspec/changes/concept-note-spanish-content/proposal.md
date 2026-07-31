## Why

When an ingest job creates concept wiki pages from a source note, the concept note's human-readable content (the `Summary` definition and the concept title) is written in English instead of Spanish. The `mutation-plan-system` prompt that generates these pages has no language instruction, so the model defaults to English — even for Spanish source material. This is inconsistent with source notes, whose `source-note-system` prompt already mandates Spanish prose ("Write summary… in Spanish, regardless of the source language"), and it produces a mixed-language vault.

## What Changes

- Update the `mutation-plan-system` prompt (via a new Flyway migration) so the LLM writes every human-readable concept-note field in Spanish, regardless of the source payload's language:
  - the `Summary` section definition (and any other prose sections it emits), and
  - the concept `title` (both the frontmatter `title` and the display title).
- Keep the canonical, machine-facing identifiers in English so linking and de-duplication stay stable — mirroring how source-note `keywords` remain English:
  - the concept `path` / slug (e.g. `wiki/concepts/machine-learning.md`), and
  - the `idempotency_key`.
- No code changes to `LlmMutationPlanService`, `ConceptResolutionService`, or guardrails — the prompt is the single source of the behavior, and concept identity already keys on the English slug/path.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `ingest-pipeline`: The "Guardrailed LLM mutation plan" behavior gains a requirement that concept notes created by the plan have their prose content and title written in Spanish (matching the source-note-body convention), while slugs and idempotency keys remain English.

## Impact

- **Prompt data**: new Flyway migration `V43__mutation_plan_concept_spanish_content.sql` updating the `mutation-plan-system` row in `llm_prompts` (mirrors the pattern of `V30`/`V35`). Applied at startup; picked up by `PromptService` cache on restart.
- **Affected code (read-only, no changes expected)**: `LlmMutationPlanService`, `ConceptResolutionService`, `IngestPipelineService`.
- **Behavioral scope**: only concept notes created on *future* ingests. Existing English concept notes are not rewritten by this change.
- **Dedup/linking**: unaffected — concept identity is keyed on the English slug/path, which this change does not touch.
