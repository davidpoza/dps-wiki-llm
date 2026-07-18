package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.manyTimes;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dpswikillm.config.AppProperties;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenAiCompatibleEmbeddingClientTests {
    @Test
    void appliesE5QueryPrefixAndReturnsVector() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(once(), requestTo("http://embeddings.test/embed"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"query: hello\"")))
                .andRespond(withSuccess("[[0.1,0.2]]", MediaType.APPLICATION_JSON));

        OpenAiCompatibleEmbeddingClient client = new OpenAiCompatibleEmbeddingClient(
                properties(),
                builder,
                new RetryingLlmExecutor());

        assertThat(client.embedQuery("hello")).containsExactly(0.1f, 0.2f);
        server.verify();
    }

    @Test
    void splitsLargeBatchIntoChunksOf32() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        // 40 texts → 2 requests: one of 32, one of 8
        String batch32Response = "[" + Collections.nCopies(32, "[0.1,0.2]").stream().collect(Collectors.joining(",")) + "]";
        String batch8Response  = "[" + Collections.nCopies(8,  "[0.3,0.4]").stream().collect(Collectors.joining(",")) + "]";
        server.expect(once(), requestTo("http://embeddings.test/embed")).andRespond(withSuccess(batch32Response, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://embeddings.test/embed")).andRespond(withSuccess(batch8Response,  MediaType.APPLICATION_JSON));

        OpenAiCompatibleEmbeddingClient client = new OpenAiCompatibleEmbeddingClient(
                properties(),
                builder,
                new RetryingLlmExecutor());

        List<String> texts = IntStream.range(0, 40).mapToObj(i -> "text" + i).toList();
        List<float[]> vectors = client.embedPassages(texts);

        assertThat(vectors).hasSize(40);
        assertThat(vectors.get(0)).containsExactly(0.1f, 0.2f);
        assertThat(vectors.get(32)).containsExactly(0.3f, 0.4f);
        server.verify();
    }

    private AppProperties properties() {
        return new AppProperties(
                "/vault",
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings.test", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://llm.test/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null, null);
    }
}
