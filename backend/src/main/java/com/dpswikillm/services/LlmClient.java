package com.dpswikillm.services;

import com.dpswikillm.dto.ChatMessage;
import java.util.List;

public interface LlmClient {
    String chat(List<ChatMessage> messages);

    /**
     * Chat requesting a strict JSON object response (OpenAI-compatible
     * {@code response_format: json_object}). Implementations that cannot force
     * JSON mode fall back to a plain {@link #chat} call.
     */
    default String chatJson(List<ChatMessage> messages) {
        return chat(messages);
    }
}
