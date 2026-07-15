package com.dpswikillm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "job_connection_candidates")
public class JobConnectionCandidate {
    @Id
    @GeneratedValue
    private UUID id;

    private UUID jobId;
    private String targetPath;
    private String proposedLink;
    private String proposedSection;

    @Enumerated(EnumType.STRING)
    private ConnectionCandidateSource source;

    private Double score;

    @Enumerated(EnumType.STRING)
    private ConnectionCandidateDecision decision = ConnectionCandidateDecision.pending;

    private Instant createdAt = Instant.now();

    public UUID getId() {
        return id;
    }

    public UUID getJobId() {
        return jobId;
    }

    public void setJobId(UUID jobId) {
        this.jobId = jobId;
    }

    public String getTargetPath() {
        return targetPath;
    }

    public void setTargetPath(String targetPath) {
        this.targetPath = targetPath;
    }

    public String getProposedLink() {
        return proposedLink;
    }

    public void setProposedLink(String proposedLink) {
        this.proposedLink = proposedLink;
    }

    public String getProposedSection() {
        return proposedSection;
    }

    public void setProposedSection(String proposedSection) {
        this.proposedSection = proposedSection;
    }

    public ConnectionCandidateSource getSource() {
        return source;
    }

    public void setSource(ConnectionCandidateSource source) {
        this.source = source;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public ConnectionCandidateDecision getDecision() {
        return decision;
    }

    public void setDecision(ConnectionCandidateDecision decision) {
        this.decision = decision;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
