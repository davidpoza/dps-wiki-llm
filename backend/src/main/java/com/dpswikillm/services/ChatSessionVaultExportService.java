package com.dpswikillm.services;

import com.dpswikillm.domain.ChatMessage;
import com.dpswikillm.domain.ChatSession;
import com.dpswikillm.repositories.ChatMessageRepository;
import com.dpswikillm.repositories.ChatSessionRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ChatSessionVaultExportService {

    private final ChatSessionRepository sessionRepo;
    private final ChatMessageRepository messageRepo;
    private final VaultPathResolver pathResolver;

    public ChatSessionVaultExportService(
            ChatSessionRepository sessionRepo,
            ChatMessageRepository messageRepo,
            VaultPathResolver pathResolver) {
        this.sessionRepo = sessionRepo;
        this.messageRepo = messageRepo;
        this.pathResolver = pathResolver;
    }

    public String exportToVault(UUID sessionId, UUID userId) throws IOException {
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

        List<ChatMessage> messages = messageRepo.findBySessionIdOrderByCreatedAtAsc(sessionId);
        if (messages.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Cannot export an empty session");
        }

        String slug = slugify(session.getTitle());
        String date = LocalDate.now().toString();
        String relPath = "outputs/chat-" + date + "-" + slug + ".md";

        Path file = pathResolver.resolve(relPath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, buildMarkdown(session, messages), StandardCharsets.UTF_8);

        return relPath;
    }

    private String buildMarkdown(ChatSession session, List<ChatMessage> messages) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Chat: ").append(session.getTitle()).append("\n\n");
        sb.append("_Exportado el ").append(LocalDate.now()).append("_\n\n");
        sb.append("---\n\n");
        for (ChatMessage m : messages) {
            if (m.getRole() == ChatMessage.Role.user) {
                sb.append("**Usuario:** ").append(m.getContent()).append("\n\n");
            } else {
                sb.append("**Asistente:** ").append(m.getContent()).append("\n\n");
            }
            sb.append("---\n\n");
        }
        return sb.toString();
    }

    private String slugify(String text) {
        return text.toLowerCase()
                .replaceAll("[^a-z0-9áéíóúüñ\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "")
                .substring(0, Math.min(40, text.length()));
    }
}
