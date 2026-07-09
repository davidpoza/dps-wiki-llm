package com.dpswikillm.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.function.Predicate;
import org.springframework.stereotype.Service;

@Service
public class JsonExtractionService {
    private final ObjectMapper objectMapper;

    public JsonExtractionService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public JsonNode extractObject(String response, Predicate<JsonNode> validator) {
        String json = extractJsonSlice(response);
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                throw new IllegalArgumentException("Expected a JSON object");
            }
            if (validator != null && !validator.test(node)) {
                throw new IllegalArgumentException("JSON object failed shape validation");
            }
            return node;
        } catch (IOException ex) {
            throw new IllegalArgumentException("Invalid JSON object in LLM response", ex);
        }
    }

    private String extractJsonSlice(String response) {
        if (response == null || response.isBlank()) {
            throw new IllegalArgumentException("LLM response is empty");
        }
        int start = response.indexOf('{');
        int end = response.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new IllegalArgumentException("LLM response does not contain a JSON object");
        }
        return response.substring(start, end + 1);
    }
}
