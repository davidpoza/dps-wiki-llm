package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.domain.ChatMessage;
import com.dpswikillm.domain.ChatSession;
import com.dpswikillm.domain.ContextSource;
import com.dpswikillm.dto.ChatContextSettingsDto;
import com.dpswikillm.repositories.ChatMessageRepository;
import com.dpswikillm.repositories.ChatSessionRepository;
import com.dpswikillm.services.ChatContextService.ContextPacket;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class ChatSessionServiceTests {

    private final UUID userId = UUID.randomUUID();
    private final UUID sessionId = UUID.randomUUID();

    private ChatSessionRepository sessionRepo;
    private ChatMessageRepository messageRepo;
    private ChatContextService chatContextService;
    private ChatContextSettings chatContextSettings;
    private LlmClient llmClient;
    private JobTokenAccounting tokenAccounting;
    private ChatSessionService service;

    @BeforeEach
    void setUp() {
        sessionRepo = mock(ChatSessionRepository.class);
        messageRepo = mock(ChatMessageRepository.class);
        chatContextService = mock(ChatContextService.class);
        chatContextSettings = mock(ChatContextSettings.class);
        llmClient = mock(LlmClient.class);
        PromptService promptService = mock(PromptService.class);
        tokenAccounting = new JobTokenAccounting();

        service =
                new ChatSessionService(
                        sessionRepo,
                        messageRepo,
                        chatContextService,
                        chatContextSettings,
                        llmClient,
                        promptService,
                        tokenAccounting);

        ChatSession session = new ChatSession(userId, "Nueva conversación");
        when(sessionRepo.findById(sessionId)).thenReturn(Optional.of(session));
        when(messageRepo.save(any(ChatMessage.class))).thenAnswer(inv -> inv.getArgument(0));
        when(messageRepo.findBySessionIdOrderByCreatedAtAsc(sessionId))
                .thenReturn(List.of(new ChatMessage(sessionId, ChatMessage.Role.user, "hi")));
        when(promptService.getText("answer-system")).thenReturn("system");
        when(chatContextSettings.get())
                .thenReturn(new ChatContextSettingsDto(5, false, 1, 5, 6_000));
    }

    @Test
    void recordsTokenUsageAndSourcesOnAssistantMessage() {
        when(chatContextService.build(anyString(), any()))
                .thenReturn(
                        new ContextPacket(
                                "### wiki/a.md\nbody",
                                List.of(ContextSource.direct("wiki/a.md", 0.9))));
        when(llmClient.chat(any()))
                .thenAnswer(
                        inv -> {
                            tokenAccounting.record(10, 20, 30);
                            return "answer";
                        });

        List<ChatMessage> result = service.addMessage(sessionId, userId, "question");

        ChatMessage assistant = result.get(1);
        assertThat(assistant.getRole()).isEqualTo(ChatMessage.Role.assistant);
        assertThat(assistant.getContent()).isEqualTo("answer");
        assertThat(assistant.getPromptTokens()).isEqualTo(10);
        assertThat(assistant.getCompletionTokens()).isEqualTo(20);
        assertThat(assistant.getTotalTokens()).isEqualTo(30);
        assertThat(assistant.getSources()).extracting(ContextSource::path).containsExactly("wiki/a.md");
    }

    @Test
    void emptyKnowledgeBaseProducesEmptySources() {
        when(chatContextService.build(anyString(), any()))
                .thenReturn(new ContextPacket("", List.of()));
        when(llmClient.chat(any())).thenReturn("answer");

        List<ChatMessage> result = service.addMessage(sessionId, userId, "question");

        assertThat(result.get(1).getSources()).isEmpty();
    }

    @Test
    void missingProviderUsageRecordsZeroTokens() {
        when(chatContextService.build(anyString(), any()))
                .thenReturn(new ContextPacket("", List.of()));
        when(llmClient.chat(any())).thenReturn("answer");

        ChatMessage assistant = service.addMessage(sessionId, userId, "question").get(1);

        assertThat(assistant.getTotalTokens()).isZero();
        assertThat(assistant.getPromptTokens()).isZero();
        assertThat(assistant.getCompletionTokens()).isZero();
    }

    @Test
    void blankContentIsRejected() {
        assertThatThrownBy(() -> service.addMessage(sessionId, userId, "   "))
                .isInstanceOf(ResponseStatusException.class);
    }
}
