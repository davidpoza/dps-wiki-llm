package com.dpswikillm.dto;

import com.dpswikillm.domain.ChatMessage;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ChatMessageDto(UUID id, UUID sessionId, String role, String content, OffsetDateTime createdAt) {

    public static ChatMessageDto from(ChatMessage m) {
        return new ChatMessageDto(m.getId(), m.getSessionId(), m.getRole().name(), m.getContent(), m.getCreatedAt());
    }
}
