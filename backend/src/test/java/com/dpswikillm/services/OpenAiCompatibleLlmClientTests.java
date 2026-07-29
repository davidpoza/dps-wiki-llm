package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.dto.ChatMessage;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class OpenAiCompatibleLlmClientTests {

    @Test
    void recordsUsageIntoActiveAccountingContext() throws Exception {
        HttpServer server =
                startChatServer(
                        "{\"choices\":[{\"message\":{\"content\":\"hi\"}}],"
                                + "\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":40,"
                                + "\"total_tokens\":140}}");
        JobTokenAccounting accounting = new JobTokenAccounting();
        try {
            OpenAiCompatibleLlmClient client = client(server, accounting);
            accounting.open();

            String content = client.chat(List.of(new ChatMessage("user", "hola")));

            assertThat(content).isEqualTo("hi");
            JobTokenAccounting.TokenUsage usage = accounting.snapshot();
            assertThat(usage.promptTokens()).isEqualTo(100);
            assertThat(usage.completionTokens()).isEqualTo(40);
            assertThat(usage.totalTokens()).isEqualTo(140);
        } finally {
            accounting.close();
            server.stop(0);
        }
    }

    @Test
    void noOpsWhenNoContextIsOpen() throws Exception {
        HttpServer server =
                startChatServer(
                        "{\"choices\":[{\"message\":{\"content\":\"hi\"}}],"
                                + "\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5,"
                                + "\"total_tokens\":15}}");
        JobTokenAccounting accounting = new JobTokenAccounting();
        try {
            OpenAiCompatibleLlmClient client = client(server, accounting);

            // No accounting.open() — recording must not throw and must not accumulate.
            String content = client.chat(List.of(new ChatMessage("user", "hola")));

            assertThat(content).isEqualTo("hi");
            assertThat(accounting.snapshot()).isEqualTo(JobTokenAccounting.TokenUsage.EMPTY);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void treatsMissingUsageAsZero() throws Exception {
        HttpServer server = startChatServer("{\"choices\":[{\"message\":{\"content\":\"hi\"}}]}");
        JobTokenAccounting accounting = new JobTokenAccounting();
        try {
            OpenAiCompatibleLlmClient client = client(server, accounting);
            accounting.open();

            assertThat(client.chat(List.of(new ChatMessage("user", "hola")))).isEqualTo("hi");
            assertThat(accounting.snapshot().isEmpty()).isTrue();
        } finally {
            accounting.close();
            server.stop(0);
        }
    }

    private OpenAiCompatibleLlmClient client(HttpServer server, JobTokenAccounting accounting) {
        return new OpenAiCompatibleLlmClient(
                properties(baseUrl(server)),
                RestClient.builder(),
                new RetryingLlmExecutor(),
                accounting);
    }

    private static HttpServer startChatServer(String responseJson) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/chat/completions",
                exchange -> {
                    exchange.getRequestBody().readAllBytes();
                    byte[] payload = responseJson.getBytes(StandardCharsets.UTF_8);
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

    private AppProperties properties(String baseUrl) {
        return new AppProperties(
                "/vault",
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings(
                        baseUrl, "multilingual-e5-small", "", 384, Duration.ofSeconds(1), 32),
                new AppProperties.Llm(baseUrl, "gpt-oss", "test"),
                new AppProperties.Telegram("", ""),
                null,
                null,
                null,
                null);
    }
}
