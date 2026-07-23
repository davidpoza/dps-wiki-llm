package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.dpswikillm.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class OpenAiCompatibleEmbeddingClientTests {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void appliesE5QueryPrefixAndReturnsVector() throws Exception {
        List<String> capturedBodies = new ArrayList<>();
        HttpServer server =
                startEmbedServer(
                        (requestBody, inputCount) -> {
                            capturedBodies.add(requestBody);
                            return "[[0.1,0.2]]";
                        });
        try {
            OpenAiCompatibleEmbeddingClient client =
                    new OpenAiCompatibleEmbeddingClient(
                            properties(baseUrl(server), 32),
                            RestClient.builder(),
                            new RetryingLlmExecutor());

            assertThat(client.embedQuery("hello")).containsExactly(0.1f, 0.2f);
            assertThat(capturedBodies).hasSize(1);
            assertThat(capturedBodies.getFirst()).contains("query: hello");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void splitsLargeBatchAccordingToConfiguredSize() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        // Echo back one vector per input; second request marked with a distinct value.
        HttpServer server =
                startEmbedServer(
                        (requestBody, inputCount) -> {
                            int idx = requests.getAndIncrement();
                            String vector = idx == 0 ? "[0.1,0.2]" : "[0.3,0.4]";
                            return "[" + Collections_nCopies(inputCount, vector) + "]";
                        });
        try {
            OpenAiCompatibleEmbeddingClient client =
                    new OpenAiCompatibleEmbeddingClient(
                            properties(baseUrl(server), 32),
                            RestClient.builder(),
                            new RetryingLlmExecutor());

            List<String> texts = IntStream.range(0, 40).mapToObj(i -> "text" + i).toList();
            List<float[]> vectors = client.embedPassages(texts);

            // 40 texts, batch 32 → 2 requests (32 + 8)
            assertThat(requests.get()).isEqualTo(2);
            assertThat(vectors).hasSize(40);
            assertThat(vectors.get(0)).containsExactly(0.1f, 0.2f);
            assertThat(vectors.get(32)).containsExactly(0.3f, 0.4f);
        } finally {
            server.stop(0);
        }
    }

    private static String Collections_nCopies(int n, String s) {
        return java.util.Collections.nCopies(n, s).stream().collect(Collectors.joining(","));
    }

    private interface EmbedResponder {
        String respond(String requestBody, int inputCount) throws IOException;
    }

    private static HttpServer startEmbedServer(EmbedResponder responder) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/embed",
                exchange -> {
                    String body =
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8);
                    JsonNode inputs = MAPPER.readTree(body).get("inputs");
                    int count = inputs != null && inputs.isArray() ? inputs.size() : 1;
                    byte[] payload =
                            responder.respond(body, count).getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, payload.length);
                    exchange.getResponseBody().write(payload);
                    exchange.close();
                });
        server.start();
        return server;
    }

    private static String baseUrl(HttpServer server) {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private AppProperties properties(String baseUrl, int maxBatchSize) {
        return new AppProperties(
                "/vault",
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings(
                        baseUrl,
                        "multilingual-e5-small",
                        "",
                        384,
                        Duration.ofSeconds(1),
                        maxBatchSize),
                new AppProperties.Llm("http://llm.test/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""),
                null,
                null,
                null,
                null);
    }
}
