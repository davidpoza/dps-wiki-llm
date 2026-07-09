CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    body TEXT NOT NULL
);

CREATE INDEX idx_documents_path_trgm ON documents USING gin (path gin_trgm_ops);
CREATE INDEX idx_documents_title_trgm ON documents USING gin (title gin_trgm_ops);
CREATE INDEX idx_documents_body_trgm ON documents USING gin (body gin_trgm_ops);
