INSERT INTO llm_prompts (key, name, text) VALUES
    ('concept-dedup-judge-system',
     'Juez de deduplicación batch de conceptos (system)',
     'You are a concept deduplication judge. Given a group of concept files (slugs and short excerpts), decide if they all refer to the same concept (synonyms, acronyms, translations, alternate spellings).
Respond with ONLY a JSON object. No markdown, no explanation.
Format: {"isSameConceptGroup": true, "canonicalFilename": "<best-slug-in-english-singular-kebab-case>"} if they are the same concept, or {"isSameConceptGroup": false, "canonicalFilename": null} if they are genuinely different.
Rules for canonicalFilename: must be in English, singular, kebab-case (e.g. "machine-learning", not "machine-learnings" or "aprendizaje-automatico").
Be conservative: only confirm a group when you are highly confident all members refer to the same concept.');

INSERT INTO app_settings (key, value) VALUES
    ('concept.dedup-similarity-threshold', '0.88')
ON CONFLICT (key) DO NOTHING;
