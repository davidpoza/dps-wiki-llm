package com.dpswikillm.services;

import com.dpswikillm.domain.LlmSourceNote;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.dto.ChatMessage;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class SourceNoteLlmService {
    private final LlmClient llmClient;
    private final JsonExtractionService jsonExtractionService;

    public SourceNoteLlmService(LlmClient llmClient, JsonExtractionService jsonExtractionService) {
        this.llmClient = llmClient;
        this.jsonExtractionService = jsonExtractionService;
    }

    public LlmSourceNote clean(NormalizedSourcePayload payload) {
        String response = llmClient.chat(List.of(
                new ChatMessage("system", "Return only JSON for a cleaned source note with summary, raw_context, extracted_claims, and open_questions. Do not invent facts."),
                new ChatMessage("user", "Source payload:\n" + payload.content())));
        JsonNode node = jsonExtractionService.extractObject(response,
                json -> nonEmpty(json, "summary") && nonEmpty(json, "raw_context"));
        return new LlmSourceNote(
                node.get("summary").asText(),
                node.get("raw_context").asText(),
                stringArray(node.get("extracted_claims")),
                stringArray(node.get("open_questions")),
                "llm",
                null);
    }

    private boolean nonEmpty(JsonNode node, String field) {
        return node.hasNonNull(field) && !node.get(field).asText().isBlank();
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
