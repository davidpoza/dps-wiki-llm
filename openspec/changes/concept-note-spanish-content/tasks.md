## 1. Prompt migration

- [x] 1.1 Create `backend/src/main/resources/db/migration/V43__mutation_plan_concept_spanish_content.sql` that runs `UPDATE llm_prompts SET text = '…', updated_at = now() WHERE key = 'mutation-plan-system';`
- [x] 1.2 Base the new prompt text on the current `V30` prompt, preserving every existing rule verbatim: JSON-only output shape, `create` actions under `wiki/concepts/<slug>.md`, English singular kebab-case slug rule (no `aprendizaje-automatico`), required `idempotency_key` (`concept-<slug>-v1`) and `Sources` backlink, "never create `wiki/topics/`", empty-array fallback, and "no `noop` actions"
- [x] 1.3 Add explicit language rules to the prompt: write the concept `title` (frontmatter `title` and display title) and the `Summary` definition / any prose sections in Spanish, regardless of the source language; keep the `path`/slug and `idempotency_key` in English
- [x] 1.4 Escape single quotes in the SQL string literal (double them) and confirm the file uses the same `UPDATE … WHERE key = 'mutation-plan-system'` shape as `V30`

## 2. Apply and verify

- [ ] 2.1 Recompile and restart the backend (local profile, port 8090) so Flyway applies `V43` and `PromptService.loadCache()` reloads the updated prompt
- [ ] 2.2 Confirm Flyway shows `V43` as applied and the backend starts cleanly with no migration/checksum errors
- [ ] 2.3 Ingest an English-language source note and confirm the created `wiki/concepts/<slug>.md` has a Spanish `title` and Spanish `Summary`, while the slug/`path` and `idempotency_key` remain English
- [ ] 2.4 Ingest a Spanish-language source note and confirm the created concept note prose/title stay Spanish and the slug stays canonical English
- [ ] 2.5 Confirm concept de-duplication and wikilink resolution still work (identity keyed on the English slug is unaffected)
