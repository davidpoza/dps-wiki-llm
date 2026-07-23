package com.dpswikillm.services;

import com.dpswikillm.dto.ChatMessage;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class NoteEnrichService {

    public record Result(String summary, List<String> keywords) {}

    private static final Logger log = LoggerFactory.getLogger(NoteEnrichService.class);

    private final LlmClient llmClient;
    private final JsonExtractionService jsonExtractionService;
    private final PromptService promptService;
    private final RetryingLlmExecutor retrying;

    public NoteEnrichService(
            LlmClient llmClient,
            JsonExtractionService jsonExtractionService,
            PromptService promptService,
            RetryingLlmExecutor retrying) {
        this.llmClient = llmClient;
        this.jsonExtractionService = jsonExtractionService;
        this.promptService = promptService;
        this.retrying = retrying;
    }

    public Result enrich(String content) {
        JsonNode node =
                retrying.executeParsing(
                        () -> {
                            log.debug(
                                    "Sending note content to LLM for enrichment ({} chars)",
                                    content.length());
                            String response =
                                    llmClient.chatJson(
                                            List.of(
                                                    new ChatMessage(
                                                            "system",
                                                            promptService.getText(
                                                                    "source-note-system")),
                                                    new ChatMessage(
                                                            "user",
                                                            "Source payload:\n" + content)));
                            log.debug("LLM enrich response ({} chars)", response.length());
                            return jsonExtractionService.extractObject(
                                    response,
                                    json ->
                                            nonEmpty(json, "summary")
                                                    && nonEmptyArray(json, "keywords"));
                        });
        return new Result(node.get("summary").asText(), normalizedKeywords(node.get("keywords")));
    }

    private List<String> normalizedKeywords(JsonNode node) {
        List<String> keywords = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        if (node == null || !node.isArray()) {
            return keywords;
        }
        for (JsonNode item : node) {
            if (!item.isTextual()) continue;
            String value = normalizeKeyword(item.asText());
            if (!value.isBlank() && seen.add(value)) {
                keywords.add(value);
            }
        }
        return keywords;
    }

    private String normalizeKeyword(String raw) {
        return raw.trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^-+|-+$", "");
    }

    private boolean nonEmpty(JsonNode node, String field) {
        return node.hasNonNull(field) && !node.get(field).asText().isBlank();
    }

    private boolean nonEmptyArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isArray() && !value.isEmpty();
    }
}
