package com.dpswikillm.dto;

import com.dpswikillm.domain.ChatSession;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ChatSessionDto(
        UUID id, String title, OffsetDateTime createdAt, OffsetDateTime updatedAt) {

    public static ChatSessionDto from(ChatSession s) {
        return new ChatSessionDto(s.getId(), s.getTitle(), s.getCreatedAt(), s.getUpdatedAt());
    }
}
