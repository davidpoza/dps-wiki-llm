package com.dpswikillm.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class JsonExtractionService {
    private static final Logger log = LoggerFactory.getLogger(JsonExtractionService.class);
    private final ObjectMapper objectMapper;

    public JsonExtractionService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public JsonNode extractObject(String response, Predicate<JsonNode> validator) {
        String json = extractJsonSlice(response);
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                log.warn("LLM response was not a JSON object. Raw response: {}", response);
                throw new LlmResponseFormatException("Expected a JSON object");
            }
            if (validator != null && !validator.test(node)) {
                log.warn(
                        "LLM response failed shape validation. Parsed keys: {}. Raw response: {}",
                        node.fieldNames(),
                        response);
                throw new LlmResponseFormatException("JSON object failed shape validation");
            }
            return node;
        } catch (IOException ex) {
            log.warn("LLM response could not be parsed as JSON. Raw response: {}", response);
            throw new LlmResponseFormatException("Invalid JSON object in LLM response", ex);
        }
    }

    private String extractJsonSlice(String response) {
        if (response == null || response.isBlank()) {
            throw new LlmResponseFormatException("LLM response is empty");
        }
        int start = response.indexOf('{');
        int end = response.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new LlmResponseFormatException("LLM response does not contain a JSON object");
        }
        return response.substring(start, end + 1);
    }
}
