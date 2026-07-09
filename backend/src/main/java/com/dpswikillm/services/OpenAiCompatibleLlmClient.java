package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.dto.ChatMessage;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class OpenAiCompatibleLlmClient implements LlmClient {
    private final AppProperties properties;
    private final RestClient restClient;
    private final RetryingLlmExecutor retrying;

    public OpenAiCompatibleLlmClient(AppProperties properties, RestClient.Builder builder, RetryingLlmExecutor retrying) {
        this.properties = properties;
        this.restClient = builder.baseUrl(properties.llm().baseUrl()).build();
        this.retrying = retrying;
    }

    @Override
    public String chat(List<ChatMessage> messages) {
        return retrying.execute(() -> doChat(messages));
    }

    @SuppressWarnings("unchecked")
    private String doChat(List<ChatMessage> messages) {
        try {
            Map<String, Object> response = restClient.post()
                    .uri("/chat/completions")
                    .header("Authorization", "Bearer " + properties.llm().apiKey())
                    .body(Map.of("model", properties.llm().model(), "messages", messages))
                    .retrieve()
                    .body(Map.class);

            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            Map<String, Object> message = (Map<String, Object>) choices.getFirst().get("message");
            return String.valueOf(message.get("content"));
        } catch (RestClientResponseException ex) {
            throw classify(ex);
        } catch (RuntimeException ex) {
            throw new LlmClientException("Chat completion failed", ex, true);
        }
    }

    private LlmClientException classify(RestClientResponseException ex) {
        HttpStatusCode status = ex.getStatusCode();
        boolean retryable = status.value() == 429 || status.is5xxServerError();
        return new LlmClientException("Chat completion failed with HTTP " + status.value(), ex, retryable);
    }
}
