package com.dpswikillm.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "jobs")
public class Job {
    @Id @GeneratedValue private UUID id;

    @Enumerated(EnumType.STRING)
    private JobType type;

    @Enumerated(EnumType.STRING)
    private JobMode mode = JobMode.unattended;

    @Enumerated(EnumType.STRING)
    private JobStatus status = JobStatus.QUEUED;

    private String payloadRef;
    private Integer queuePosition;
    private String preGitSha;
    private String commitRange;
    private UUID snapshotId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String affectedPaths = "[]";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String result;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String conceptProposals = "[]";

    private String error;

    private Long promptTokens;
    private Long completionTokens;
    private Long totalTokens;

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
    private Instant startedAt;
    private Instant completedAt;

    public UUID getId() {
        return id;
    }

    public JobType getType() {
        return type;
    }

    public void setType(JobType type) {
        this.type = type;
    }

    public JobMode getMode() {
        return mode;
    }

    public void setMode(JobMode mode) {
        this.mode = mode;
    }

    public JobStatus getStatus() {
        return status;
    }

    public void transitionTo(JobStatus status) {
        this.status = status;
        this.updatedAt = Instant.now();
        if (status == JobStatus.STARTED) {
            this.startedAt = this.updatedAt;
        }
        if (status == JobStatus.COMPLETED
                || status == JobStatus.FAILED
                || status == JobStatus.REVERTED) {
            this.completedAt = this.updatedAt;
        }
    }

    public String getPayloadRef() {
        return payloadRef;
    }

    public String getCommitRange() {
        return commitRange;
    }

    public String getPreGitSha() {
        return preGitSha;
    }

    public String getAffectedPaths() {
        return affectedPaths;
    }

    public void setPayloadRef(String payloadRef) {
        this.payloadRef = payloadRef;
    }

    public Integer getQueuePosition() {
        return queuePosition;
    }

    public void setQueuePosition(Integer queuePosition) {
        this.queuePosition = queuePosition;
    }

    public void setPreGitSha(String preGitSha) {
        this.preGitSha = preGitSha;
    }

    public void setCommitRange(String commitRange) {
        this.commitRange = commitRange;
    }

    public UUID getSnapshotId() {
        return snapshotId;
    }

    public void setSnapshotId(UUID snapshotId) {
        this.snapshotId = snapshotId;
    }

    public void setAffectedPaths(String affectedPaths) {
        this.affectedPaths = affectedPaths;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getConceptProposals() {
        return conceptProposals;
    }

    public void setConceptProposals(String conceptProposals) {
        this.conceptProposals = conceptProposals;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public Long getPromptTokens() {
        return promptTokens;
    }

    public Long getCompletionTokens() {
        return completionTokens;
    }

    public Long getTotalTokens() {
        return totalTokens;
    }

    /**
     * Adds the given chat-completion token counts to this job's running totals. Null-safe: totals
     * start from zero, so historical rows with null columns accumulate correctly.
     */
    public void addTokenUsage(long prompt, long completion, long total) {
        this.promptTokens = (this.promptTokens == null ? 0L : this.promptTokens) + prompt;
        this.completionTokens =
                (this.completionTokens == null ? 0L : this.completionTokens) + completion;
        this.totalTokens = (this.totalTokens == null ? 0L : this.totalTokens) + total;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}
