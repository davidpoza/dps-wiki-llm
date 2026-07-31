-- Per-message chat context observability: token usage and the notes loaded into context.
ALTER TABLE chat_messages ADD COLUMN prompt_tokens     BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN completion_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN total_tokens      BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN sources           JSONB  NOT NULL DEFAULT '[]'::jsonb;
