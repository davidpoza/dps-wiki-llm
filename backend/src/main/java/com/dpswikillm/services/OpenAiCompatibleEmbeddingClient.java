package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class OpenAiCompatibleEmbeddingClient implements EmbeddingClient {
    private final AppProperties properties;
    private final RestClient restClient;
    private final RetryingLlmExecutor retrying;

    public OpenAiCompatibleEmbeddingClient(AppProperties properties, RestClient.Builder builder, RetryingLlmExecutor retrying) {
        this.properties = properties;
        this.restClient = builder.baseUrl(properties.embeddings().baseUrl()).build();
        this.retrying = retrying;
    }

    @Override
    public List<float[]> embedPassages(List<String> texts) {
        return embed(texts.stream().map(text -> "passage: " + text).toList());
    }

    @Override
    public float[] embedQuery(String text) {
        return embed(List.of("query: " + text)).getFirst();
    }

    @SuppressWarnings("unchecked")
    private List<float[]> embed(List<String> inputs) {
        return retrying.execute(() -> {
            try {
                Map<String, Object> response = restClient.post()
                        .uri("/embeddings")
                        .header("Authorization", "Bearer " + properties.embeddings().apiKey())
                        .body(Map.of("model", properties.embeddings().model(), "input", inputs))
                        .retrieve()
                        .body(Map.class);
                List<Map<String, Object>> data = (List<Map<String, Object>>) response.get("data");
                List<float[]> vectors = new ArrayList<>();
                for (Map<String, Object> row : data) {
                    List<Number> values = (List<Number>) row.get("embedding");
                    float[] vector = new float[values.size()];
                    for (int i = 0; i < values.size(); i += 1) {
                        vector[i] = values.get(i).floatValue();
                    }
                    vectors.add(vector);
                }
                return vectors;
            } catch (RestClientResponseException ex) {
                boolean retryable = ex.getStatusCode().value() == 429 || ex.getStatusCode().is5xxServerError();
                throw new LlmClientException("Embedding sidecar failed with HTTP " + ex.getStatusCode().value(), ex, retryable);
            } catch (RuntimeException ex) {
                throw new LlmClientException("Embedding sidecar is unreachable or returned an invalid response", ex, true);
            }
        });
    }
}
