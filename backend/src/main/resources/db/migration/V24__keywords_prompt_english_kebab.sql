-- Refine the keywords prompt: always English, singular, no articles, lowercase, kebab-case.
-- Done as a new migration (not an edit of V23) because V23 was already applied in
-- environments and editing it would trigger a Flyway checksum mismatch.
UPDATE llm_prompts
SET text = 'Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{"keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]}
Rules: do not invent facts; keywords must be 5-15 relevant terms (concepts, topics, entities) that best represent the note for semantic search; the keywords MUST always be in English, translating from the note language when needed; each keyword MUST be singular, contain no articles, be lowercase, and use hyphens instead of spaces (kebab-case, e.g. "machine-learning", "bile-acid"); the "keywords" array is required and must be non-empty.',
    updated_at = now()
WHERE key = 'keywords-system';
