package com.dpswikillm.services;

import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.dto.ChatMessage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class LlmMutationPlanService {
    private final LlmClient llmClient;
    private final JsonExtractionService jsonExtractionService;
    private final ObjectMapper objectMapper;
    private final PromptService promptService;
    private final RetryingLlmExecutor retrying;

    public LlmMutationPlanService(LlmClient llmClient, JsonExtractionService jsonExtractionService,
                                   ObjectMapper objectMapper, PromptService promptService,
                                   RetryingLlmExecutor retrying) {
        this.llmClient = llmClient;
        this.jsonExtractionService = jsonExtractionService;
        this.objectMapper = objectMapper;
        this.promptService = promptService;
        this.retrying = retrying;
    }

    public MutationPlan requestPlan(NormalizedSourcePayload payload, String sourceNotePath) {
        JsonNode node = retrying.executeParsing(() -> {
            String response = llmClient.chat(List.of(
                    new ChatMessage("system", promptService.getText("mutation-plan-system")),
                    new ChatMessage("user", "Raw path: " + payload.rawPath() + "\nSource note: " + sourceNotePath + "\nContent:\n" + payload.content())));
            return jsonExtractionService.extractObject(response,
                    json -> json.hasNonNull("plan_id") && json.has("page_actions") && json.get("page_actions").isArray());
        });
        return objectMapper.convertValue(node, MutationPlan.class);
    }

    public MutationPlan emptyPlan(NormalizedSourcePayload payload) {
        return new MutationPlan("llm-plan-" + payload.sourceId().replace(":", "-"), List.of());
    }
}
