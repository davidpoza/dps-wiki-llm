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

    // multilingual-e5-small max sequence ~512 tokens ≈ 2000 chars; truncate to stay safe
    private static final int MAX_CHARS = 2000;
    // TEI server hard limit per request
    private static final int MAX_BATCH_SIZE = 32;

    @Override
    public List<float[]> embedPassages(List<String> texts) {
        return embed(texts.stream().map(text -> truncate("passage: " + text)).toList());
    }

    @Override
    public float[] embedQuery(String text) {
        return embed(List.of(truncate("query: " + text))).getFirst();
    }

    private static String truncate(String text) {
        return text.length() > MAX_CHARS ? text.substring(0, MAX_CHARS) : text;
    }

    private List<float[]> embed(List<String> inputs) {
        if (inputs.size() <= MAX_BATCH_SIZE) {
            return embedBatch(inputs);
        }
        List<float[]> all = new ArrayList<>(inputs.size());
        for (int i = 0; i < inputs.size(); i += MAX_BATCH_SIZE) {
            all.addAll(embedBatch(inputs.subList(i, Math.min(i + MAX_BATCH_SIZE, inputs.size()))));
        }
        return all;
    }

    @SuppressWarnings("unchecked")
    private List<float[]> embedBatch(List<String> inputs) {
        return retrying.execute(() -> {
            try {
                // Use TEI native /embed endpoint — supports truncate:true unlike /embeddings (OpenAI-compat)
                List<List<Number>> response = restClient.post()
                        .uri("/embed")
                        .header("Authorization", "Bearer " + properties.embeddings().apiKey())
                        .body(Map.of("inputs", inputs, "truncate", true, "normalize", true))
                        .retrieve()
                        .body(List.class);
                List<float[]> vectors = new ArrayList<>();
                for (List<Number> values : response) {
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
