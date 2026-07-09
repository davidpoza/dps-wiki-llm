CREATE TABLE job_connection_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    target_path TEXT NOT NULL,
    proposed_link TEXT NOT NULL,
    proposed_section TEXT,
    source TEXT NOT NULL,
    score DOUBLE PRECISION,
    decision TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_connection_candidates_job_id ON job_connection_candidates(job_id);
CREATE INDEX idx_job_connection_candidates_decision ON job_connection_candidates(decision);
