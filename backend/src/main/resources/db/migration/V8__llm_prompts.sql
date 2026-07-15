CREATE TABLE llm_prompts (
    key        VARCHAR(100) PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    text       TEXT         NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO llm_prompts (key, name, text) VALUES
    ('source-note-system',
     'Nota de fuente (system)',
     'Return only JSON for a cleaned source note with summary, raw_context, extracted_claims, and open_questions. Do not invent facts.'),
    ('mutation-plan-system',
     'Plan de mutación (system)',
     'Return only JSON for an optional mutation plan. Use page_actions create/update/noop. Never create wiki/topics. Every write needs idempotency_key and Sources backlink.'),
    ('answer-system',
     'Respuesta a pregunta (system)',
     'You are a knowledge assistant. Answer only from the provided context. If the context is empty, say so. Cite which documents you used.');
