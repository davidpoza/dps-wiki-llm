package com.dpswikillm.config;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Path vaultPath,
        List<String> corsAllowedOrigins,
        Embeddings embeddings,
        Llm llm,
        Telegram telegram,
        Jwt jwt,
        Admin admin
) {
    public AppProperties {
        if (vaultPath == null) {
            vaultPath = Path.of("/vault");
        }
        if (corsAllowedOrigins == null || corsAllowedOrigins.isEmpty()) {
            corsAllowedOrigins = List.of("http://localhost:4200", "http://localhost:8080");
        }
        if (embeddings == null) {
            embeddings = new Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(3));
        }
        if (llm == null) {
            llm = new Llm("http://localhost:11434/v1", "gpt-oss", "");
        }
        if (telegram == null) {
            telegram = new Telegram("", "");
        }
        if (jwt == null) {
            jwt = new Jwt("", 86400000L);
        }
        if (admin == null) {
            admin = new Admin("", "");
        }
    }

    public record Embeddings(String baseUrl, String model, String apiKey, int dimension, Duration healthTimeout) {}

    public record Llm(String baseUrl, String model, String apiKey) {}

    public record Telegram(String token, String allowedChatId) {}

    public record Jwt(String secret, long expirationMs) {}

    public record Admin(String username, String password) {}
}
