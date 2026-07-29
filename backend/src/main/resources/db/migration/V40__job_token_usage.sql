ALTER TABLE jobs ADD COLUMN prompt_tokens BIGINT;
ALTER TABLE jobs ADD COLUMN completion_tokens BIGINT;
ALTER TABLE jobs ADD COLUMN total_tokens BIGINT;
