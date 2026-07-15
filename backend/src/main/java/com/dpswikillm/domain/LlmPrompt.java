package com.dpswikillm.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "llm_prompts")
public class LlmPrompt {

    @Id
    @Column(length = 100)
    private String key;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String text;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected LlmPrompt() {}

    public LlmPrompt(String key, String name, String text) {
        this.key = key;
        this.name = name;
        this.text = text;
    }

    public String getKey() { return key; }
    public String getName() { return name; }
    public String getText() { return text; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    public void setText(String text) {
        this.text = text;
    }

    @PreUpdate
    void onUpdate() { this.updatedAt = OffsetDateTime.now(); }
}
