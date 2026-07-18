ALTER TABLE snapshot_files
    ADD COLUMN lines_added  INT,
    ADD COLUMN lines_deleted INT;
