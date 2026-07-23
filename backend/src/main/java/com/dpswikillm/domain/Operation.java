package com.dpswikillm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "operations")
public class Operation {
    @Id @GeneratedValue private UUID id;

    private UUID jobId;
    private String type;
    private String status;
    private String commitSha;
    private int affectedNoteCount;
    private Instant createdAt = Instant.now();
    private Instant completedAt;

    public void setJobId(UUID jobId) {
        this.jobId = jobId;
    }

    public void setType(String type) {
        this.type = type;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public void setCommitSha(String commitSha) {
        this.commitSha = commitSha;
    }

    public void setAffectedNoteCount(int affectedNoteCount) {
        this.affectedNoteCount = affectedNoteCount;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }
}
