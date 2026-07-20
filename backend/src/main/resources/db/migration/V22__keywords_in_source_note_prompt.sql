UPDATE llm_prompts
SET text = 'Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{"summary": "<concise summary>", "raw_context": "<full relevant context>", "extracted_claims": ["<claim1>", "<claim2>"], "open_questions": ["<question1>"], "keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]}
Rules: do not invent facts; keywords must be 5-15 relevant terms (concepts, topics, entities) that best represent the note for semantic search; all fields are required.',
    updated_at = now()
WHERE key = 'source-note-system';
