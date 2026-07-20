package com.dpswikillm.services;

import com.dpswikillm.dto.ChatMessage;
import com.dpswikillm.dto.KeywordGenerationProgress;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Batch-generates the frontmatter {@code keywords} field for existing notes under
 * {@code wiki/concepts} and {@code wiki/sources} that do not already have one. The
 * LLM input text is the note's {@code Summary} section when present, otherwise the
 * note body with the {@code Sources}, {@code Related}, and {@code Links} sections
 * removed. Writes flow through {@link FileService#saveContent} so they are versioned
 * and replicated to WebDAV.
 */
@Service
public class KeywordGenerationService {
    private static final Logger log = LoggerFactory.getLogger(KeywordGenerationService.class);

    private static final List<String> TARGET_FOLDERS = List.of("wiki/concepts", "wiki/sources");
    private static final Set<String> EXCLUDED_SECTIONS = Set.of("Sources", "Related", "Links");
    private static final String PROMPT_KEY = "keywords-system";

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final FileService fileService;
    private final LlmClient llmClient;
    private final PromptService promptService;
    private final JsonExtractionService jsonExtractionService;
    private final RetryingLlmExecutor retrying;

    public KeywordGenerationService(VaultPathResolver pathResolver, MarkdownService markdownService,
                                    FileService fileService, LlmClient llmClient, PromptService promptService,
                                    JsonExtractionService jsonExtractionService, RetryingLlmExecutor retrying) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.fileService = fileService;
        this.llmClient = llmClient;
        this.promptService = promptService;
        this.jsonExtractionService = jsonExtractionService;
        this.retrying = retrying;
    }

    public KeywordGenerationProgress generateKeywords() throws IOException {
        return generateKeywords(progress -> {});
    }

    public KeywordGenerationProgress generateKeywords(Consumer<KeywordGenerationProgress> onProgress) throws IOException {
        List<Path> files = collectNotes();
        int total = files.size();
        int processed = 0;
        int updated = 0;
        int skipped = 0;
        for (Path path : files) {
            try {
                if (generateForNote(path)) {
                    updated += 1;
                } else {
                    skipped += 1;
                }
            } catch (RuntimeException ex) {
                skipped += 1;
                log.warn("Keyword generation failed for {}: {}", path, ex.getMessage());
            }
            processed += 1;
            onProgress.accept(new KeywordGenerationProgress(processed, total, updated, skipped));
        }
        KeywordGenerationProgress result = new KeywordGenerationProgress(processed, total, updated, skipped);
        if (total == 0) {
            onProgress.accept(result);
        }
        return result;
    }

    private List<Path> collectNotes() throws IOException {
        List<Path> files = new ArrayList<>();
        for (String folder : TARGET_FOLDERS) {
            Path root = pathResolver.resolve(folder);
            if (!Files.exists(root)) {
                continue;
            }
            try (Stream<Path> paths = Files.walk(root)) {
                paths.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().endsWith(".md"))
                        .sorted()
                        .forEach(files::add);
            }
        }
        return files;
    }

    /** @return true if the note was updated with keywords, false if it was skipped. */
    private boolean generateForNote(Path path) {
        String body;
        try {
            body = Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read note: " + path, ex);
        }
        MarkdownDocument document = markdownService.parse(body);
        if (hasKeywords(document.frontmatter().get("keywords"))) {
            return false;
        }
        String inputText = selectSourceText(document);
        if (inputText.isBlank()) {
            return false;
        }
        List<String> keywords = generateKeywords(inputText);
        if (keywords.isEmpty()) {
            return false;
        }
        String updated = markdownService.injectFrontmatterList(body, "keywords", keywords);
        fileService.saveContent(toRelativePath(path), updated);
        return true;
    }

    private boolean hasKeywords(Object value) {
        if (value instanceof Iterable<?> items) {
            return items.iterator().hasNext();
        }
        return value != null && !value.toString().isBlank();
    }

    private String selectSourceText(MarkdownDocument document) {
        String summary = document.sections().get("Summary");
        if (summary != null && !summary.isBlank()) {
            return summary.trim();
        }
        StringBuilder builder = new StringBuilder();
        if (!document.title().isBlank()) {
            builder.append("# ").append(document.title()).append("\n\n");
        }
        for (Map.Entry<String, String> entry : document.sections().entrySet()) {
            if (EXCLUDED_SECTIONS.contains(entry.getKey())) {
                continue;
            }
            String content = entry.getValue() == null ? "" : entry.getValue().trim();
            builder.append("## ").append(entry.getKey()).append('\n');
            if (!content.isBlank()) {
                builder.append(content).append('\n');
            }
            builder.append('\n');
        }
        return builder.toString().trim();
    }

    private List<String> generateKeywords(String inputText) {
        JsonNode node = retrying.executeParsing(() -> {
            String response = llmClient.chatJson(List.of(
                    new ChatMessage("system", promptService.getText(PROMPT_KEY)),
                    new ChatMessage("user", inputText)));
            return jsonExtractionService.extractObject(response, json -> nonEmptyArray(json, "keywords"));
        });
        List<String> keywords = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode item : node.get("keywords")) {
            if (!item.isTextual()) {
                continue;
            }
            String value = normalizeKeyword(item.asText());
            if (!value.isBlank() && seen.add(value)) {
                keywords.add(value);
            }
        }
        return keywords;
    }

    /**
     * Enforces the mechanical keyword format: lowercase, spaces replaced by hyphens
     * (kebab-case), with collapsed/trimmed hyphens. Singular form and article removal
     * are the model's responsibility via the prompt.
     */
    private String normalizeKeyword(String raw) {
        return raw.trim().toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^-+|-+$", "");
    }

    private boolean nonEmptyArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isArray() && !value.isEmpty();
    }

    private String toRelativePath(Path path) {
        return pathResolver.vaultRoot().relativize(path.toAbsolutePath().normalize())
                .toString().replace('\\', '/');
    }
}
