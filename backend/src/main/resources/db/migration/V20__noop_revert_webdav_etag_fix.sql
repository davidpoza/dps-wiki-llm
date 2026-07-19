-- No-op migration accompanying the revert of the WebDAV ETag startup fix (PR #26).
-- V19 already cleared all remote_etag values; they will be repopulated by
-- initializeBaselines() on the next application restart.
SELECT 1;
