package com.dpswikillm.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Per-file WebDAV replication baseline. {@code syncedHash} is the SHA-256 of the content last known
 * to match the remote; comparing it against the current local and remote hashes during Sync is how
 * conflicts are detected.
 */
@Entity
@Table(name = "vault_file_sync")
public class VaultFileSync {
    @Id private String path;

    private String syncedHash;
    private String remoteEtag;
    private boolean replicated;
    private boolean conflict;

    @Column(columnDefinition = "TEXT")
    private String remoteContent;

    private Instant updatedAt = Instant.now();

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public String getSyncedHash() {
        return syncedHash;
    }

    public void setSyncedHash(String syncedHash) {
        this.syncedHash = syncedHash;
    }

    public String getRemoteEtag() {
        return remoteEtag;
    }

    public void setRemoteEtag(String remoteEtag) {
        this.remoteEtag = remoteEtag;
    }

    public boolean isReplicated() {
        return replicated;
    }

    public void setReplicated(boolean replicated) {
        this.replicated = replicated;
    }

    public boolean isConflict() {
        return conflict;
    }

    public void setConflict(boolean conflict) {
        this.conflict = conflict;
    }

    public String getRemoteContent() {
        return remoteContent;
    }

    public void setRemoteContent(String remoteContent) {
        this.remoteContent = remoteContent;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
