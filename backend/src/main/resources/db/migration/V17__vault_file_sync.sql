-- Per-file WebDAV replication baseline used to detect conflicts during sync.
CREATE TABLE vault_file_sync (
    path TEXT PRIMARY KEY,
    synced_hash TEXT,
    remote_etag TEXT,
    replicated BOOLEAN NOT NULL DEFAULT false,
    conflict BOOLEAN NOT NULL DEFAULT false,
    remote_content TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_file_sync_conflict ON vault_file_sync(conflict) WHERE conflict = true;
