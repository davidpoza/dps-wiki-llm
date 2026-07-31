package com.dpswikillm.dto;

import com.dpswikillm.domain.ChatMessage;
import com.dpswikillm.domain.ContextSource;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record ChatMessageDto(
        UUID id,
        UUID sessionId,
        String role,
        String content,
        OffsetDateTime createdAt,
        List<ContextSource> sources,
        long promptTokens,
        long completionTokens,
        long totalTokens) {

    public static ChatMessageDto from(ChatMessage m) {
        return new ChatMessageDto(
                m.getId(),
                m.getSessionId(),
                m.getRole().name(),
                m.getContent(),
                m.getCreatedAt(),
                m.getSources(),
                m.getPromptTokens(),
                m.getCompletionTokens(),
                m.getTotalTokens());
    }
}
