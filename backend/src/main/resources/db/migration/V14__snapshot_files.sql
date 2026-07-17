CREATE TABLE snapshot_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content_before TEXT,
    content_after TEXT
);

CREATE INDEX idx_snapshot_files_snapshot_id ON snapshot_files(snapshot_id);
CREATE UNIQUE INDEX idx_snapshot_files_snapshot_path ON snapshot_files(snapshot_id, path);
