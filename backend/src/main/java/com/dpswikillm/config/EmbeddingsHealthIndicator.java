package com.dpswikillm.config;

import java.net.URI;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class EmbeddingsHealthIndicator implements HealthIndicator {
    private final RestClient restClient;
    private final AppProperties properties;

    public EmbeddingsHealthIndicator(RestClient.Builder builder, AppProperties properties) {
        this.properties = properties;
        this.restClient = builder.build();
    }

    @Override
    public Health health() {
        try {
            URI uri = URI.create(properties.embeddings().baseUrl() + "/health");
            ResponseEntity<String> response = restClient.get().uri(uri).retrieve().toEntity(String.class);
            if (response.getStatusCode().is2xxSuccessful()) {
                return Health.up()
                        .withDetail("model", properties.embeddings().model())
                        .withDetail("dimension", properties.embeddings().dimension())
                        .build();
            }
            return Health.down().withDetail("status", response.getStatusCode().value()).build();
        } catch (RuntimeException ex) {
            return Health.down(ex)
                    .withDetail("baseUrl", properties.embeddings().baseUrl())
                    .build();
        }
    }
}
