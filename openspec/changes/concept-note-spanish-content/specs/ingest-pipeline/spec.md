## ADDED Requirements

### Requirement: Concept-note content is generated in Spanish

The `mutation-plan-system` prompt SHALL instruct the LLM to write every human-readable field of a concept page it creates — the concept `title` (both the frontmatter `title` and the display title) and the `Summary` definition (and any other prose sections the plan emits) — in Spanish, regardless of the source payload's original language. The machine-facing identifiers SHALL remain in English so linking and de-duplication stay stable: the concept `path` / slug (English singular kebab-case, e.g. `wiki/concepts/machine-learning.md`) and the `idempotency_key`.

#### Scenario: English source payload yields a Spanish concept note

- **WHEN** an ingest job runs the guardrailed LLM mutation plan for a source payload written in English and the plan creates a `wiki/concepts/<slug>.md` page
- **THEN** the concept note's `title` and `Summary` prose are in Spanish
- **AND** the concept `path` / slug and `idempotency_key` remain English

#### Scenario: Spanish source payload yields a Spanish concept note

- **WHEN** an ingest job runs the guardrailed LLM mutation plan for a source payload already written in Spanish and the plan creates a concept page
- **THEN** the concept note's `title` and `Summary` prose are in Spanish
- **AND** the concept `path` / slug and `idempotency_key` remain English

#### Scenario: Slug stays canonical English regardless of title language

- **WHEN** the mutation plan proposes a concept whose Spanish title differs from its English slug (e.g. title "Aprendizaje automático", slug `machine-learning`)
- **THEN** the page is created at `wiki/concepts/machine-learning.md` with a Spanish `title`, so concept de-duplication and wikilink resolution continue to key on the English slug
