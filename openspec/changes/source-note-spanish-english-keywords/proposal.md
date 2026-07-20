## Why

The `source-note-system` prompt (used by `SourceNoteLlmService` during ingestion of `wiki/sources/**`) does not pin the note language and gives keywords only a vague "5-15 relevant terms" rule. As a result the generated note body drifts in language depending on the source, and the frontmatter `keywords` come out inconsistent (mixed language, plurals, spaces, casing) — unlike the standalone `keywords-system` prompt, which V24 already tightened to English kebab-case. Ingestion should produce a Spanish note body with a clean, uniform English keyword set so semantic search and browsing stay consistent.

## What Changes

- Update the `source-note-system` prompt so the LLM writes the **note body in Spanish** — `summary`, `raw_context`, `extracted_claims`, and `open_questions` — regardless of the source language.
- Update the same prompt so the frontmatter `keywords` (5–15 terms) are always **English, singular, lowercase, kebab-case** (hyphens instead of spaces, no articles), translating from the source when needed — aligning it with the existing `keywords-system` rules.
- Add mechanical keyword normalization on the source-note ingestion path (lowercase + kebab-case) so the format holds even when the model does not fully comply, matching `KeywordGenerationService.normalizeKeyword`.
- Ship the prompt change as a new Flyway migration (append-only, no edits to already-applied migrations).

## Capabilities

### New Capabilities
- `source-note-generation`: Language and keyword-format contract for the LLM source-note extraction step in the ingestion pipeline — Spanish note body, English kebab-case keywords in frontmatter.

### Modified Capabilities
<!-- None: no existing spec covers source-note generation. -->

## Impact

- **Prompt / DB**: new Flyway migration `V25__source_note_spanish_english_keywords.sql` updating the `source-note-system` row in `llm_prompts`. Picked up by `PromptService` cache on startup.
- **Backend code**: `SourceNoteLlmService` gains keyword normalization (mirrors `KeywordGenerationService`); no signature changes to `LlmSourceNote` or `SourceNotePlanner`.
- **Existing notes**: not rewritten by this change. Only newly ingested `wiki/sources/**` notes get the new behavior; existing notes remain untouched (the separate keyword backfill flow is unchanged).
- **Tests**: `SourceNoteLlmService` unit coverage for keyword normalization; no API contract changes.
