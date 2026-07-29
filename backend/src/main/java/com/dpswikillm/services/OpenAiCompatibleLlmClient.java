package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.dto.ChatMessage;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class OpenAiCompatibleLlmClient implements LlmClient {
    // Bounds a single generation. Generous enough for slow LLM responses, but
    // finite so a stalled upstream connection can't hang the pipeline forever.
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(120);

    private final AppProperties properties;
    private final RestClient restClient;
    private final RetryingLlmExecutor retrying;
    private final JobTokenAccounting tokenAccounting;

    public OpenAiCompatibleLlmClient(
            AppProperties properties,
            RestClient.Builder builder,
            RetryingLlmExecutor retrying,
            JobTokenAccounting tokenAccounting) {
        this.properties = properties;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        this.restClient =
                builder.baseUrl(properties.llm().baseUrl()).requestFactory(factory).build();
        this.retrying = retrying;
        this.tokenAccounting = tokenAccounting;
    }

    @Override
    public String chat(List<ChatMessage> messages) {
        return retrying.execute(() -> doChat(messages, false));
    }

    @Override
    public String chatJson(List<ChatMessage> messages) {
        return retrying.execute(() -> doChat(messages, true));
    }

    @SuppressWarnings("unchecked")
    private String doChat(List<ChatMessage> messages, boolean jsonMode) {
        try {
            Map<String, Object> requestBody = new LinkedHashMap<>();
            requestBody.put("model", properties.llm().model());
            requestBody.put("messages", messages);
            if (jsonMode) {
                requestBody.put("response_format", Map.of("type", "json_object"));
            }
            Map<String, Object> response =
                    restClient
                            .post()
                            .uri("/chat/completions")
                            .header("Authorization", "Bearer " + properties.llm().apiKey())
                            .body(requestBody)
                            .retrieve()
                            .body(Map.class);

            recordUsage(response);

            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            Map<String, Object> message = (Map<String, Object>) choices.getFirst().get("message");
            return String.valueOf(message.get("content"));
        } catch (RestClientResponseException ex) {
            throw classify(ex);
        } catch (RuntimeException ex) {
            throw new LlmClientException("Chat completion failed", ex, true);
        }
    }

    /**
     * Attributes the response's {@code usage} block to the active job accounting context. A missing
     * or partial usage object is treated as zeros; some OpenAI-compatible providers omit {@code
     * total_tokens}, so it falls back to prompt + completion. Never throws — token accounting must
     * not fail an otherwise-successful completion.
     */
    private void recordUsage(Map<String, Object> response) {
        if (!(response.get("usage") instanceof Map<?, ?> usage)) {
            return;
        }
        long prompt = asLong(usage.get("prompt_tokens"));
        long completion = asLong(usage.get("completion_tokens"));
        long total = asLong(usage.get("total_tokens"));
        if (total == 0) {
            total = prompt + completion;
        }
        tokenAccounting.record(prompt, completion, total);
    }

    private static long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private LlmClientException classify(RestClientResponseException ex) {
        HttpStatusCode status = ex.getStatusCode();
        boolean retryable = status.value() == 429 || status.is5xxServerError();
        return new LlmClientException(
                "Chat completion failed with HTTP " + status.value(), ex, retryable);
    }
}
