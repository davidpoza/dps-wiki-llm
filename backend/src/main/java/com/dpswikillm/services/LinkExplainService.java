package com.dpswikillm.services;

import com.dpswikillm.dto.ChatMessage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class LinkExplainService {

    private static final int MAX_NOTE_CHARS = 3000;

    private final VaultPathResolver pathResolver;
    private final LlmClient llmClient;
    private final PromptService promptService;

    public LinkExplainService(
            VaultPathResolver pathResolver, LlmClient llmClient, PromptService promptService) {
        this.pathResolver = pathResolver;
        this.llmClient = llmClient;
        this.promptService = promptService;
    }

    public String explain(String sourcePath, String targetPath) throws IOException {
        String sourceContent = readNote(sourcePath);
        String targetContent = readNote(targetPath);

        String userMessage =
                "Source note title: "
                        + noteName(sourcePath)
                        + "\n"
                        + "Source note content:\n"
                        + sourceContent
                        + "\n\n"
                        + "Target note title: "
                        + noteName(targetPath)
                        + "\n"
                        + "Target note content:\n"
                        + targetContent;

        return llmClient.chat(
                List.of(
                        new ChatMessage("system", promptService.getText("link-explain-system")),
                        new ChatMessage("user", userMessage)));
    }

    private String readNote(String vaultRelativePath) throws IOException {
        Path resolved = pathResolver.resolve(vaultRelativePath);
        if (!Files.exists(resolved)) {
            throw new NoteNotFoundException(vaultRelativePath);
        }
        String content = Files.readString(resolved, StandardCharsets.UTF_8);
        if (content.length() > MAX_NOTE_CHARS) {
            content = content.substring(0, MAX_NOTE_CHARS);
        }
        return content;
    }

    private String noteName(String vaultRelativePath) {
        String name = vaultRelativePath;
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        if (name.endsWith(".md")) name = name.substring(0, name.length() - 3);
        return name;
    }

    public static class NoteNotFoundException extends RuntimeException {
        public NoteNotFoundException(String path) {
            super("Note not found: " + path);
        }
    }
}
