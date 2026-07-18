package com.dpswikillm.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "snapshot_files")
public class SnapshotFile {
    @Id
    @GeneratedValue
    private UUID id;

    private UUID snapshotId;
    private String path;

    @Column(columnDefinition = "TEXT")
    private String contentBefore;

    @Column(columnDefinition = "TEXT")
    private String contentAfter;

    private Integer linesAdded;
    private Integer linesDeleted;

    public UUID getId() { return id; }
    public UUID getSnapshotId() { return snapshotId; }
    public void setSnapshotId(UUID snapshotId) { this.snapshotId = snapshotId; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getContentBefore() { return contentBefore; }
    public void setContentBefore(String contentBefore) { this.contentBefore = contentBefore; }
    public String getContentAfter() { return contentAfter; }
    public void setContentAfter(String contentAfter) { this.contentAfter = contentAfter; }
    public Integer getLinesAdded() { return linesAdded; }
    public void setLinesAdded(Integer linesAdded) { this.linesAdded = linesAdded; }
    public Integer getLinesDeleted() { return linesDeleted; }
    public void setLinesDeleted(Integer linesDeleted) { this.linesDeleted = linesDeleted; }
}
