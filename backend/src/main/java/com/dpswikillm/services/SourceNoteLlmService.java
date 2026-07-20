package com.dpswikillm.services;

import com.dpswikillm.domain.LlmSourceNote;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.dto.ChatMessage;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class SourceNoteLlmService {
    private static final Logger log = LoggerFactory.getLogger(SourceNoteLlmService.class);
    private final LlmClient llmClient;
    private final JsonExtractionService jsonExtractionService;
    private final PromptService promptService;
    private final RetryingLlmExecutor retrying;

    public SourceNoteLlmService(LlmClient llmClient, JsonExtractionService jsonExtractionService,
                                PromptService promptService, RetryingLlmExecutor retrying) {
        this.llmClient = llmClient;
        this.jsonExtractionService = jsonExtractionService;
        this.promptService = promptService;
        this.retrying = retrying;
    }

    public LlmSourceNote clean(NormalizedSourcePayload payload) {
        // Retry the whole generate-and-parse cycle: a malformed response (missing
        // required fields or keywords) yields a fresh generation rather than
        // failing the ingest outright.
        JsonNode node = retrying.executeParsing(() -> {
            log.debug("Sending source payload to LLM ({} chars)", payload.content().length());
            String response = llmClient.chatJson(List.of(
                    new ChatMessage("system", promptService.getText("source-note-system")),
                    new ChatMessage("user", "Source payload:\n" + payload.content())));
            log.debug("LLM raw response ({} chars): {}", response.length(), response);
            return jsonExtractionService.extractObject(response,
                    json -> nonEmpty(json, "summary") && nonEmpty(json, "raw_context") && nonEmptyArray(json, "keywords"));
        });
        return new LlmSourceNote(
                node.get("summary").asText(),
                node.get("raw_context").asText(),
                stringArray(node.get("extracted_claims")),
                stringArray(node.get("open_questions")),
                "llm",
                null,
                stringArray(node.get("keywords")));
    }

    private boolean nonEmpty(JsonNode node, String field) {
        return node.hasNonNull(field) && !node.get(field).asText().isBlank();
    }

    private boolean nonEmptyArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isArray() && !value.isEmpty();
    }

    private List<String> stringArray(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            if (item.isTextual() && !item.asText().isBlank()) {
                values.add(item.asText());
            }
        }
        return values;
    }
}
