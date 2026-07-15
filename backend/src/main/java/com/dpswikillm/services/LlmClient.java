package com.dpswikillm.services;

import com.dpswikillm.dto.ChatMessage;
import java.util.List;

public interface LlmClient {
    String chat(List<ChatMessage> messages);
}
