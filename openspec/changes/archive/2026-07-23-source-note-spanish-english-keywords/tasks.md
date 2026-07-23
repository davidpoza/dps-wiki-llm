## 1. Prompt migration

- [x] 1.1 Create `backend/src/main/resources/db/migration/V25__source_note_spanish_english_keywords.sql` that `UPDATE`s the `source-note-system` row in `llm_prompts`, keeping the same JSON shape (`summary`, `raw_context`, `extracted_claims`, `open_questions`, `keywords`) but adding rules: write the note body in Spanish; keywords always English, singular, no articles, lowercase, kebab-case (hyphens, no spaces), 5–15 non-empty terms — reusing the V24 keyword wording. Set `updated_at = now()`.
- [x] 1.2 Confirm the migration is append-only (do not edit V22/V24) and that the SQL string escaping matches the existing migrations (single-quote doubling).

## 2. Keyword normalization on ingestion path

- [x] 2.1 In `SourceNoteLlmService`, add a private `normalizeKeyword(String)` that lowercases, replaces whitespace runs with `-`, collapses repeated `-`, and trims edge `-` (mirroring `KeywordGenerationService.normalizeKeyword`).
- [x] 2.2 In `clean()`, build the keyword list by normalizing each parsed keyword, dropping blanks, and de-duplicating with a `LinkedHashSet` to preserve first-seen order; pass the result into the `LlmSourceNote` instead of the raw `stringArray(node.get("keywords"))`.

## 3. Tests

- [x] 3.1 Add/extend `SourceNoteLlmServiceTests` (or the relevant existing test) to assert keyword normalization: mixed-case/spaced input becomes lowercase kebab-case, duplicates collapse, blanks drop, order preserved.
- [x] 3.2 Run the backend test suite and confirm ingestion-related tests still pass.

## 4. Verification

- [x] 4.1 Start the backend so Flyway applies `V25`; query `llm_prompts` for `source-note-system` and confirm the new text is stored.
- [x] 4.2 Ingest one English and one Spanish source; confirm the generated `wiki/sources/**` note body is in Spanish and the frontmatter `keywords` are English, singular, lowercase, kebab-case (5–15 terms).
