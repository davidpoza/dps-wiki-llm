package com.dpswikillm.controllers;

import com.dpswikillm.domain.ChatMessage;
import com.dpswikillm.domain.ChatSession;
import com.dpswikillm.domain.User;
import com.dpswikillm.dto.ChatMessageDto;
import com.dpswikillm.dto.ChatSessionDetailDto;
import com.dpswikillm.dto.ChatSessionDto;
import com.dpswikillm.dto.SendMessageRequest;
import com.dpswikillm.services.ChatSessionService;
import com.dpswikillm.services.ChatSessionVaultExportService;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/chat/sessions")
public class ChatSessionController {

    private final ChatSessionService sessionService;
    private final ChatSessionVaultExportService exportService;

    public ChatSessionController(ChatSessionService sessionService,
                                  ChatSessionVaultExportService exportService) {
        this.sessionService = sessionService;
        this.exportService = exportService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ChatSessionDto createSession(@AuthenticationPrincipal User user) {
        ChatSession session = sessionService.createSession(user.getId());
        return ChatSessionDto.from(session);
    }

    @GetMapping
    public List<ChatSessionDto> listSessions(@AuthenticationPrincipal User user) {
        return sessionService.listSessions(user.getId())
                .stream().map(ChatSessionDto::from).toList();
    }

    @GetMapping("/{id}")
    public ChatSessionDetailDto getSession(@AuthenticationPrincipal User user,
                                           @PathVariable UUID id) {
        ChatSession session = sessionService.getSession(id, user.getId());
        List<ChatMessage> messages = sessionService.getMessages(id, user.getId());
        return ChatSessionDetailDto.from(session, messages);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSession(@AuthenticationPrincipal User user, @PathVariable UUID id) {
        sessionService.deleteSession(id, user.getId());
    }

    @PostMapping("/{id}/messages")
    public List<ChatMessageDto> addMessage(@AuthenticationPrincipal User user,
                                           @PathVariable UUID id,
                                           @RequestBody @Valid SendMessageRequest request) {
        List<ChatMessage> messages = sessionService.addMessage(id, user.getId(), request.content());
        return messages.stream().map(ChatMessageDto::from).toList();
    }

    @PostMapping("/{id}/export-to-vault")
    public Map<String, String> exportToVault(@AuthenticationPrincipal User user,
                                              @PathVariable UUID id) throws IOException {
        String path = exportService.exportToVault(id, user.getId());
        return Map.of("path", path);
    }
}
