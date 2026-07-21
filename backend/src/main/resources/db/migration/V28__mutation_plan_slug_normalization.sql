UPDATE llm_prompts
SET text = 'Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{"plan_id": "<unique-string>", "page_actions": [{"action": "create|update|noop", "path": "<wiki-path>", "title": "<title>", "frontmatter": {}, "sections": {}, "idempotency_key": "<unique-key>"}]}
Rules:
- Never create wiki/topics/ pages.
- Every write action must include idempotency_key and a Sources backlink in sections.
- Use noop if no wiki page needs updating.
- Concept paths (wiki/concepts/) MUST use English singular kebab-case slugs (e.g. wiki/concepts/machine-learning.md, NOT wiki/concepts/machine-learnings.md or wiki/concepts/aprendizaje-automatico.md).',
    updated_at = now()
WHERE key = 'mutation-plan-system';
