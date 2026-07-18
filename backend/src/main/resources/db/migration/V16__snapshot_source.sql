-- Per-file change source: LOCAL_EDIT | JOB | WEBDAV_PULL
-- Existing rows default to JOB; manual saves are re-tagged as local edits.
ALTER TABLE snapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'JOB';

UPDATE snapshots SET source = 'LOCAL_EDIT' WHERE operation_type = 'manual-save';
