ALTER TABLE jobs ADD COLUMN snapshot_id UUID REFERENCES snapshots(id);
