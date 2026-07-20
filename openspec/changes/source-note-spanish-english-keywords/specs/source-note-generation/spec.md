## ADDED Requirements

### Requirement: Source note body is generated in Spanish

The `source-note-system` prompt SHALL instruct the LLM to write every free-text field of the extracted source note — `summary`, `raw_context`, `extracted_claims`, and `open_questions` — in Spanish, regardless of the source payload's original language. The `keywords` field is exempt from this rule (see the keyword-format requirement).

#### Scenario: English source payload yields Spanish note body

- **WHEN** `SourceNoteLlmService.clean()` processes a source payload written in English
- **THEN** the returned `summary`, `raw_context`, `extracted_claims`, and `open_questions` are in Spanish

#### Scenario: Spanish source payload stays in Spanish

- **WHEN** `SourceNoteLlmService.clean()` processes a source payload already written in Spanish
- **THEN** the returned note body remains in Spanish

### Requirement: Source note keywords are English kebab-case

The `source-note-system` prompt SHALL instruct the LLM to return 5–15 frontmatter `keywords` that are always in English (translated from the source language when needed), and each keyword MUST be singular, contain no articles, be lowercase, and use hyphens instead of spaces (kebab-case). The `keywords` array MUST be non-empty.

#### Scenario: Keywords translated to English

- **WHEN** the source payload is in Spanish and the LLM emits keywords
- **THEN** each keyword is an English term in singular, lowercase, kebab-case form (e.g. `bile-acid`, `machine-learning`)

#### Scenario: Keyword count bounds

- **WHEN** the LLM returns the source note
- **THEN** the `keywords` array contains between 5 and 15 non-empty terms

### Requirement: Ingestion normalizes keyword format mechanically

`SourceNoteLlmService` SHALL mechanically normalize each keyword it receives before storing it on the `LlmSourceNote`, so the stored format holds even when the model does not fully comply with the prompt. Normalization SHALL lowercase the term, replace whitespace runs with a single hyphen, collapse repeated hyphens, and trim leading/trailing hyphens. Blank results SHALL be dropped and duplicates removed, preserving first-seen order.

#### Scenario: Model returns mixed-case spaced keyword

- **WHEN** the LLM returns a keyword such as `"Bile Acid"`
- **THEN** the stored keyword is `bile-acid`

#### Scenario: Duplicate and blank keywords removed

- **WHEN** the LLM returns keywords that normalize to duplicates or to an empty string
- **THEN** duplicates are collapsed to a single entry and blank entries are dropped, preserving the order of first appearance
