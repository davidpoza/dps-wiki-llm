-- Pin the source-note body language to Spanish and align its frontmatter keywords
-- with the English kebab-case rules already applied to `keywords-system` in V24.
-- Append-only (not an edit of V22/V24) to avoid a Flyway checksum mismatch.
UPDATE llm_prompts
SET text = 'Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{"summary": "<concise summary>", "raw_context": "<full relevant context>", "extracted_claims": ["<claim1>", "<claim2>"], "open_questions": ["<question1>"], "keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]}
Rules: do not invent facts; write the summary, raw_context, extracted_claims and open_questions in Spanish, regardless of the source language; keywords must be 5-15 relevant terms (concepts, topics, entities) that best represent the note for semantic search; the keywords MUST always be in English, translating from the source language when needed; each keyword MUST be singular, contain no articles, be lowercase, and use hyphens instead of spaces (kebab-case, e.g. "machine-learning", "bile-acid"); the "keywords" array is required and must be non-empty; all fields are required.',
    updated_at = now()
WHERE key = 'source-note-system';
