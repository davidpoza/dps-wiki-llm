-- Clear all stored remote ETags so the next WebDAV sync performs a full content comparison
-- for every file. This is a one-time fix for ETags that were incorrectly stored at startup
-- by a previous version of initializeBaselines(), which could cause changed remote files to
-- be silently skipped by the ETag fast-path.
-- After the next sync the ETags will be correctly repopulated from actual sync outcomes.
UPDATE vault_file_sync SET remote_etag = NULL;
