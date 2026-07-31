## Context

Concept wiki pages are created during ingest by the guardrailed LLM mutation plan. `LlmMutationPlanService.requestPlan()` sends the `mutation-plan-system` prompt (stored in the `llm_prompts` table, last set by migration `V30__mutation_plan_concept_creation_prompt.sql`) and parses the returned `page_actions` into `create` actions for `wiki/concepts/<slug>.md`. Each action carries a `title`, `frontmatter`, and a `Summary` section holding a "one-sentence definition of the concept".

The `V30` prompt is written entirely in English and instructs the model to produce English singular kebab-case slugs, but it never states which language the human-readable prose (`Summary` definition, `title`) should be in. With no instruction, the model defaults to English, so concept notes read in English even when the source note is Spanish.

By contrast, the sibling `source-note-system` prompt (`V35__update_source_note_system_prompt_v2.sql`) explicitly splits languages: prose fields (`summary`, `raw_context`, `extracted_claims`, `open_questions`) are Spanish "regardless of the source language", while `keywords` stay English as canonical identifiers. This change brings the concept-creation prompt in line with that convention.

Prompts are cached in `PromptService` at startup (`@PostConstruct loadCache()`), so a migration that updates the row takes effect on the next backend restart; no code path reads the prompt file directly.

## Goals / Non-Goals

**Goals:**
- Concept notes created by the mutation plan have Spanish `title` and Spanish `Summary`/prose, regardless of the source language.
- Preserve English `path`/slug and `idempotency_key` so concept de-duplication and wikilink resolution stay stable.
- Ship as a data-only change (Flyway migration on `llm_prompts`), mirroring the `V30`/`V35` pattern — no Java changes.

**Non-Goals:**
- Rewriting or back-filling existing English concept notes already in the vault.
- Changing `LlmMutationPlanService`, `ConceptResolutionService`, guardrails, or the dedup pipeline.
- Making the concept language user-configurable (Spanish is hardcoded in the prompt, matching the source-note convention).

## Decisions

**Decision: Fix via a new Flyway migration that rewrites the `mutation-plan-system` prompt text.**
- The prompt is the single source of the behavior; there is no language logic in Java. Updating the stored prompt is the minimal, lowest-risk fix and matches how every prior prompt tweak shipped (`V30`, `V33`, `V34`, `V35`).
- Migration name: `V43__mutation_plan_concept_spanish_content.sql` (next free version after `V42`). It runs `UPDATE llm_prompts SET text = '…', updated_at = now() WHERE key = 'mutation-plan-system';`.
- Alternative considered: add a post-processing/translation step in Java — rejected as heavier, adds an LLM round-trip, and duplicates responsibility the prompt already owns.

**Decision: Spanish for human-readable prose (`title`, `Summary`), English for canonical identifiers (`path`/slug, `idempotency_key`).**
- This mirrors the source-note split exactly (Spanish body, English `keywords`). Concept identity is keyed on the slug/path in `ConceptResolutionService` (`action.path()`, `slugFromPath()`), not the title, so a Spanish title does not affect dedup or linking.
- Alternative considered: also translate the slug to Spanish — rejected. The English slug is the canonical de-dup and wikilink key (the `V30` rule explicitly forbids `aprendizaje-automatico`), and translating it would fragment identity across languages.

**Decision: Preserve every existing rule in the prompt; add only the language instruction.**
- To avoid regressions, the new prompt keeps the full `V30` text (JSON-only output, `create` actions under `wiki/concepts/`, English kebab-case slug rule, required `idempotency_key` and `Sources` backlink, no `wiki/topics/`, empty-array fallback, no `noop`) and inserts explicit language rules: write `title` and `Summary` prose in Spanish regardless of source language; keep slug and `idempotency_key` English.

## Risks / Trade-offs

- **Mixed-language vault during transition** (existing concept notes stay English while new ones are Spanish) → Acceptable and out of scope; a separate back-fill/regeneration pass can normalize old notes later if desired. Slugs are unchanged so links keep working across both.
- **Model still emits English prose despite the instruction** → Same residual risk as the source-note prompt; the explicit "regardless of the source language" phrasing is the same mitigation already proven there. Verified during E2E by ingesting an English source and inspecting the created concept note.
- **Prompt edit accidentally drops a `V30` rule (e.g. slug format), causing guardrail rejections** → Mitigation: diff the new prompt against `V30` and keep all structural rules verbatim; guardrails would convert any malformed action to `noop` rather than corrupt the vault.
- **Cache staleness**: the updated prompt only loads on backend restart → Expected behavior of `PromptService`; the deploy already restarts the process, so no extra step needed.

## Migration Plan

1. Add `backend/src/main/resources/db/migration/V43__mutation_plan_concept_spanish_content.sql` updating the `mutation-plan-system` row, preserving all `V30` rules and adding the Spanish-prose / English-identifier language rules.
2. Restart the backend (`mvn compile` + process restart, local profile on port 8090) so Flyway applies `V43` and `PromptService` reloads its cache.
3. Verify via E2E: ingest an English-language source, confirm the created `wiki/concepts/<slug>.md` has a Spanish `title` and Spanish `Summary`, and that the slug/path stayed English.
4. **Rollback**: revert by shipping a follow-up migration that restores the `V30` prompt text (the same no-op-revert pattern used by `V20`). The change is data-only and reversible.

## Open Questions

_None._ The title-vs-slug language split follows the established source-note precedent, and dedup keys on the English slug, so no behavioral ambiguity remains.
