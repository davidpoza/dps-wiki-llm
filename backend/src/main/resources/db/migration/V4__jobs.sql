CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'unattended',
    status TEXT NOT NULL,
    payload_ref TEXT,
    queue_position INTEGER,
    pre_git_sha TEXT,
    commit_range TEXT,
    affected_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_status_created_at ON jobs(status, created_at);
CREATE INDEX idx_jobs_type_created_at ON jobs(type, created_at);
