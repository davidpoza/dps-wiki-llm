package com.dpswikillm.controllers;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dpswikillm.config.PasswordConfig;
import com.dpswikillm.config.SecurityConfig;
import com.dpswikillm.domain.ChatMessage;
import com.dpswikillm.domain.ChatSession;
import com.dpswikillm.domain.ContextSource;
import com.dpswikillm.domain.User;
import com.dpswikillm.security.JwtAuthFilter;
import com.dpswikillm.security.JwtUtil;
import com.dpswikillm.services.ChatSessionService;
import com.dpswikillm.services.ChatSessionVaultExportService;
import com.dpswikillm.services.UserService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ChatSessionController.class)
@Import({SecurityConfig.class, PasswordConfig.class, JwtAuthFilter.class})
class ChatSessionControllerTests {

    @Autowired private MockMvc mockMvc;

    @MockBean private ChatSessionService sessionService;
    @MockBean private ChatSessionVaultExportService exportService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private UserService userService;

    private static UsernamePasswordAuthenticationToken principal() {
        User user = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        return new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
    }

    private static ChatMessage assistantWithContext() {
        ChatMessage m = new ChatMessage(null, ChatMessage.Role.assistant, "answer");
        m.setSources(List.of(new ContextSource("wiki/a.md", 0.9, ContextSource.Provenance.DIRECT, 0)));
        m.setTokenUsage(10, 20, 30);
        return m;
    }

    @Test
    void addMessage_returnsSourcesAndTokens() throws Exception {
        ChatMessage user = new ChatMessage(null, ChatMessage.Role.user, "question");
        when(sessionService.addMessage(any(), any(), eq("question")))
                .thenReturn(List.of(user, assistantWithContext()));

        mockMvc.perform(
                        post("/chat/sessions/{id}/messages", java.util.UUID.randomUUID())
                                .with(authentication(principal()))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"content\":\"question\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[1].sources[0].path").value("wiki/a.md"))
                .andExpect(jsonPath("$[1].sources[0].provenance").value("DIRECT"))
                .andExpect(jsonPath("$[1].totalTokens").value(30))
                .andExpect(jsonPath("$[1].promptTokens").value(10));
    }

    @Test
    void addMessage_blankContent_returns400() throws Exception {
        mockMvc.perform(
                        post("/chat/sessions/{id}/messages", java.util.UUID.randomUUID())
                                .with(authentication(principal()))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"content\":\"   \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getSession_exposesPersistedSources() throws Exception {
        ChatSession session = new ChatSession(null, "t");
        when(sessionService.getSession(any(), any())).thenReturn(session);
        when(sessionService.getMessages(any(), any())).thenReturn(List.of(assistantWithContext()));

        mockMvc.perform(
                        get("/chat/sessions/{id}", java.util.UUID.randomUUID())
                                .with(authentication(principal())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].sources[0].path").value("wiki/a.md"))
                .andExpect(jsonPath("$.messages[0].totalTokens").value(30));
    }
}
