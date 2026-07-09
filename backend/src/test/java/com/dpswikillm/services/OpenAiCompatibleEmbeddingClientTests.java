package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dpswikillm.config.AppProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenAiCompatibleEmbeddingClientTests {
    @Test
    void appliesE5QueryPrefixAndReturnsVector() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(once(), requestTo("http://embeddings.test/embeddings"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"query: hello\"")))
                .andRespond(withSuccess("{\"data\":[{\"embedding\":[0.1,0.2]}]}", MediaType.APPLICATION_JSON));

        OpenAiCompatibleEmbeddingClient client = new OpenAiCompatibleEmbeddingClient(
                properties(),
                builder,
                new RetryingLlmExecutor());

        assertThat(client.embedQuery("hello")).containsExactly(0.1f, 0.2f);
        server.verify();
    }

    private AppProperties properties() {
        return new AppProperties(
                java.nio.file.Path.of("/vault"),
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings.test", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://llm.test/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""));
    }
}
