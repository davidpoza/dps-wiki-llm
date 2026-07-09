CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    dimension INTEGER NOT NULL,
    embedding vector(${embed_dimension}) NOT NULL,
    normalized_text_hash TEXT NOT NULL,
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, model)
);

CREATE INDEX idx_document_embeddings_hnsw
    ON document_embeddings
    USING hnsw (embedding vector_cosine_ops);
