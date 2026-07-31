package com.dpswikillm.services;

import com.dpswikillm.domain.ChatMessage;
import com.dpswikillm.domain.ChatSession;
import com.dpswikillm.dto.ChatContextSettingsDto;
import com.dpswikillm.repositories.ChatMessageRepository;
import com.dpswikillm.repositories.ChatSessionRepository;
import com.dpswikillm.services.ChatContextService.ContextPacket;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class ChatSessionService {

    private static final int MAX_HISTORY_CHARS = 6_000;

    private final ChatSessionRepository sessionRepo;
    private final ChatMessageRepository messageRepo;
    private final ChatContextService chatContextService;
    private final ChatContextSettings chatContextSettings;
    private final LlmClient llmClient;
    private final PromptService promptService;
    private final JobTokenAccounting tokenAccounting;

    public ChatSessionService(
            ChatSessionRepository sessionRepo,
            ChatMessageRepository messageRepo,
            ChatContextService chatContextService,
            ChatContextSettings chatContextSettings,
            LlmClient llmClient,
            PromptService promptService,
            JobTokenAccounting tokenAccounting) {
        this.sessionRepo = sessionRepo;
        this.messageRepo = messageRepo;
        this.chatContextService = chatContextService;
        this.chatContextSettings = chatContextSettings;
        this.llmClient = llmClient;
        this.promptService = promptService;
        this.tokenAccounting = tokenAccounting;
    }

    public ChatSession createSession(UUID userId) {
        ChatSession session = new ChatSession(userId, "Nueva conversación");
        return sessionRepo.save(session);
    }

    @Transactional(readOnly = true)
    public List<ChatSession> listSessions(UUID userId) {
        return sessionRepo.findByUserIdOrderByUpdatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public ChatSession getSession(UUID sessionId, UUID userId) {
        return findOwnedSession(sessionId, userId);
    }

    @Transactional(readOnly = true)
    public List<ChatMessage> getMessages(UUID sessionId, UUID userId) {
        findOwnedSession(sessionId, userId);
        return messageRepo.findBySessionIdOrderByCreatedAtAsc(sessionId);
    }

    public void deleteSession(UUID sessionId, UUID userId) {
        ChatSession session = findOwnedSession(sessionId, userId);
        sessionRepo.delete(session);
    }

    public List<ChatMessage> addMessage(UUID sessionId, UUID userId, String userContent) {
        if (userContent == null || userContent.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Message content is required");
        }

        ChatSession session = findOwnedSession(sessionId, userId);

        ChatMessage userMsg =
                messageRepo.save(new ChatMessage(sessionId, ChatMessage.Role.user, userContent));

        List<ChatMessage> history = messageRepo.findBySessionIdOrderByCreatedAtAsc(sessionId);

        // Set title from first user message
        if (history.size() == 1 && session.getTitle().equals("Nueva conversación")) {
            session.setTitle(
                    userContent.length() <= 60 ? userContent : userContent.substring(0, 60));
        }

        ChatContextSettingsDto settings = chatContextSettings.get();
        ContextPacket context = chatContextService.build(userContent, settings);
        List<com.dpswikillm.dto.ChatMessage> prompt =
                buildPrompt(userContent, history, context.contextText());

        String answer;
        JobTokenAccounting.TokenUsage usage;
        tokenAccounting.open();
        try {
            answer = llmClient.chat(prompt);
        } finally {
            usage = tokenAccounting.snapshot();
            tokenAccounting.close();
        }

        ChatMessage assistantMsg = new ChatMessage(sessionId, ChatMessage.Role.assistant, answer);
        assistantMsg.setSources(context.sources());
        assistantMsg.setTokenUsage(
                usage.promptTokens(), usage.completionTokens(), usage.totalTokens());
        assistantMsg = messageRepo.save(assistantMsg);

        session.touch();
        sessionRepo.save(session);

        return List.of(userMsg, assistantMsg);
    }

    private List<com.dpswikillm.dto.ChatMessage> buildPrompt(
            String question, List<ChatMessage> history, String kbContext) {
        List<com.dpswikillm.dto.ChatMessage> messages = new ArrayList<>();
        messages.add(
                new com.dpswikillm.dto.ChatMessage(
                        "system", promptService.getText("answer-system")));

        // Include windowed history (excluding the just-saved user message which is last in history)
        List<ChatMessage> historyWithoutLast =
                history.size() > 1 ? history.subList(0, history.size() - 1) : List.of();
        int usedChars = 0;
        List<com.dpswikillm.dto.ChatMessage> historyMessages = new ArrayList<>();
        for (int i = historyWithoutLast.size() - 1; i >= 0; i--) {
            ChatMessage m = historyWithoutLast.get(i);
            int len = m.getContent().length();
            if (usedChars + len > MAX_HISTORY_CHARS) break;
            historyMessages.add(
                    0, new com.dpswikillm.dto.ChatMessage(m.getRole().name(), m.getContent()));
            usedChars += len;
        }
        messages.addAll(historyMessages);

        String userPayload =
                kbContext.isBlank()
                        ? "Question: " + question
                        : "Question: " + question + "\n\nContext:\n" + kbContext;
        messages.add(new com.dpswikillm.dto.ChatMessage("user", userPayload));
        return messages;
    }

    private ChatSession findOwnedSession(UUID sessionId, UUID userId) {
        ChatSession session =
                sessionRepo
                        .findById(sessionId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Session not found"));
        if (!session.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        }
        return session;
    }
}
