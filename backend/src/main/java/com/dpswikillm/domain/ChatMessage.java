package com.dpswikillm.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "chat_messages")
public class ChatMessage {

    public enum Role {
        user,
        assistant
    }

    @Id @GeneratedValue private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Role role;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "prompt_tokens", nullable = false)
    private long promptTokens = 0;

    @Column(name = "completion_tokens", nullable = false)
    private long completionTokens = 0;

    @Column(name = "total_tokens", nullable = false)
    private long totalTokens = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<ContextSource> sources = new ArrayList<>();

    protected ChatMessage() {}

    public ChatMessage(UUID sessionId, Role role, String content) {
        this.sessionId = sessionId;
        this.role = role;
        this.content = content;
    }

    public UUID getId() {
        return id;
    }

    public UUID getSessionId() {
        return sessionId;
    }

    public Role getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public long getPromptTokens() {
        return promptTokens;
    }

    public long getCompletionTokens() {
        return completionTokens;
    }

    public long getTotalTokens() {
        return totalTokens;
    }

    public List<ContextSource> getSources() {
        return sources;
    }

    /** Records the notes that were loaded into the LLM context for this (assistant) message. */
    public void setSources(List<ContextSource> sources) {
        this.sources = sources != null ? sources : new ArrayList<>();
    }

    /** Records the LLM token usage attributed to this (assistant) message. */
    public void setTokenUsage(long promptTokens, long completionTokens, long totalTokens) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        this.totalTokens = totalTokens;
    }
}
