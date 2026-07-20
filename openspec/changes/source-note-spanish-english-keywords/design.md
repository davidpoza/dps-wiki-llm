## Context

Source notes for `wiki/sources/**` are produced during ingestion by `SourceNoteLlmService.clean()`, which sends the `source-note-system` system prompt (stored in `llm_prompts`, cached by `PromptService`) plus the raw payload, and parses a JSON object with `summary`, `raw_context`, `extracted_claims`, `open_questions`, and `keywords`. The current prompt (last set in `V22__keywords_in_source_note_prompt.sql`) neither pins the note language nor constrains keyword form beyond "5-15 relevant terms".

Separately, `KeywordGenerationService` (backfill for existing notes) uses the `keywords-system` prompt, which `V24__keywords_prompt_english_kebab.sql` already tightened to "always English, singular, no articles, lowercase, kebab-case", and it mechanically normalizes keywords via `normalizeKeyword()`. The source-note path has no equivalent normalization. This change brings the source-note step in line: Spanish body, English kebab-case keywords, with a mechanical safety net.

Prompts are seeded and updated exclusively through append-only Flyway migrations; editing an already-applied migration triggers a checksum mismatch (the rationale explicitly recorded in V24). Latest migration is `V24`.

## Goals / Non-Goals

**Goals:**
- Force the source-note body (`summary`, `raw_context`, `extracted_claims`, `open_questions`) into Spanish via the `source-note-system` prompt.
- Force frontmatter `keywords` into English, singular, lowercase, kebab-case, 5–15 terms — consistent with the `keywords-system` prompt.
- Guarantee the mechanical keyword format on the ingestion path even under imperfect model compliance.

**Non-Goals:**
- Rewriting or re-translating existing `wiki/sources/**` notes (no backfill in this change).
- Changing the `keywords-system` prompt or `KeywordGenerationService`.
- Changing `LlmSourceNote`, `SourceNotePlanner`, or any REST/DTO contract.
- Localizing note structure/section headings rendered by the planner (only LLM-authored free text is affected).

## Decisions

- **Update the prompt via new migration `V25__source_note_spanish_english_keywords.sql`.** `UPDATE llm_prompts SET text = ... WHERE key = 'source-note-system'`. Append-only, matching the V24 precedent; the JSON shape is unchanged (still `summary`/`raw_context`/`extracted_claims`/`open_questions`/`keywords`), only the rules text changes to add the Spanish-body instruction and the English-kebab-case keyword rules. Alternative — editing V22 — rejected: Flyway checksum mismatch on already-migrated environments.
- **Reuse the V24 keyword-rule wording for consistency.** The keyword rules in the new prompt mirror the `keywords-system` text so both paths converge on identical guidance, easing future maintenance.
- **Add mechanical normalization in `SourceNoteLlmService`.** Introduce a `normalizeKeyword()` equivalent to `KeywordGenerationService`'s (lowercase → collapse whitespace to `-` → collapse repeated `-` → trim edge `-`), applied while building the keyword list, with dedupe via `LinkedHashSet` to preserve first-seen order. Alternative — extracting a shared helper/util now — deferred to avoid widening scope; both call sites keep a small private method (a later refactor can unify them).
- **No enforcement of the 5–15 count in code.** The bound stays a prompt-level instruction; existing parse retries (`RetryingLlmExecutor` + non-empty `keywords` validation) already guard against empty/malformed output, matching current behavior.

## Risks / Trade-offs

- **Model may still emit off-language body text** → mitigated only at the prompt level; free-text language is not machine-enforced. Acceptable: same reliance the pipeline already places on the prompt for structure.
- **Prompt cache staleness** → `PromptService` loads from DB; the migration runs at startup before requests, so the updated text is in the cache. No action needed beyond normal restart.
- **Duplicated normalization logic across two services** → minor DRY cost, accepted to keep the change small; flagged for a future shared utility.

## Migration Plan

1. Add `V25__source_note_spanish_english_keywords.sql` updating the `source-note-system` row.
2. Add keyword normalization + dedupe to `SourceNoteLlmService.clean()`.
3. On deploy, Flyway applies V25; `PromptService` serves the new prompt to the next ingest. Rollback: a further append-only migration restoring the prior text (never an edit of V25).
