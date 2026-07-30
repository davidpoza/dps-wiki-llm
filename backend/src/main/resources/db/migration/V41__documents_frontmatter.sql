-- Structured frontmatter index for property filters ([key: value] search syntax).
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE documents ADD COLUMN frontmatter JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX idx_documents_frontmatter ON documents USING gin (frontmatter);
