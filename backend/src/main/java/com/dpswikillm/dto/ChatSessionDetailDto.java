package com.dpswikillm.dto;

import com.dpswikillm.domain.ChatMessage;
import com.dpswikillm.domain.ChatSession;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record ChatSessionDetailDto(
        UUID id,
        String title,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        List<ChatMessageDto> messages) {

    public static ChatSessionDetailDto from(ChatSession s, List<ChatMessage> messages) {
        return new ChatSessionDetailDto(
                s.getId(),
                s.getTitle(),
                s.getCreatedAt(),
                s.getUpdatedAt(),
                messages.stream().map(ChatMessageDto::from).toList());
    }
}
