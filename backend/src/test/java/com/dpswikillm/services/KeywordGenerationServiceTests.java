package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.dto.ChatMessage;
import com.dpswikillm.dto.KeywordGenerationProgress;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

class KeywordGenerationServiceTests {

    @TempDir Path vault;

    private final MarkdownService markdownService = new MarkdownService();

    @Test
    void generatesKeywordsRespectingScopeIdempotencyAndSourceSelection() throws Exception {
        Path concepts = Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.createDirectories(vault.resolve("wiki/topics"));

        Files.writeString(
                concepts.resolve("a-with-summary.md"),
                """
                ---
                type: "concept"
                ---

                # With Summary

                ## Summary
                This is the summary.

                ## Sources
                - [[some-source]]
                """);

        Files.writeString(
                concepts.resolve("b-no-summary.md"),
                """
                ---
                type: "concept"
                ---

                # No Summary

                ## Facts
                - Fact one included

                ## Related
                - related-should-be-excluded

                ## Sources
                - sources-should-be-excluded
                """);

        Files.writeString(
                concepts.resolve("c-already.md"),
                """
                ---
                type: "concept"
                keywords:
                  - existing
                ---

                # Already

                ## Summary
                Already has keywords.
                """);

        // Out of scope: must be ignored entirely.
        Files.writeString(
                vault.resolve("wiki/topics/ignored.md"),
                """
                ---
                type: "topic"
                ---

                # Ignored

                ## Summary
                Should not be processed.
                """);

        LlmClient llmClient = mock(LlmClient.class);
        // Mixed case, spaces, and a post-normalization duplicate to exercise kebab-case
        // normalization.
        when(llmClient.chatJson(anyList()))
                .thenReturn(
                        "{\"keywords\": [\"Machine Learning\", \"software economy\", \"machine learning\"]}");
        PromptService promptService = mock(PromptService.class);
        when(promptService.getText("keywords-system")).thenReturn("system prompt");
        FileService fileService = mock(FileService.class);

        KeywordGenerationService service =
                new KeywordGenerationService(
                        resolver(),
                        markdownService,
                        fileService,
                        llmClient,
                        promptService,
                        new JsonExtractionService(new ObjectMapper()),
                        new RetryingLlmExecutor());

        KeywordGenerationProgress result = service.generateKeywords();

        // Scope: topics/ ignored; idempotency: c-already.md skipped.
        assertThat(result.total()).isEqualTo(3);
        assertThat(result.updated()).isEqualTo(2);
        assertThat(result.skipped()).isEqualTo(1);

        // Two notes written with the deduped keyword list injected into frontmatter.
        ArgumentCaptor<String> pathCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> contentCaptor = ArgumentCaptor.forClass(String.class);
        verify(fileService, times(2)).saveContent(pathCaptor.capture(), contentCaptor.capture());
        assertThat(pathCaptor.getAllValues())
                .containsExactlyInAnyOrder(
                        "wiki/concepts/a-with-summary.md", "wiki/concepts/b-no-summary.md");
        assertThat(contentCaptor.getAllValues())
                .allSatisfy(
                        content ->
                                assertThat(content)
                                        .contains(
                                                "keywords:\n  - \"machine-learning\"\n  - \"software-economy\"\n"));

        // Source-text selection: Summary used verbatim; body-minus-excluded when no Summary.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ChatMessage>> messagesCaptor = ArgumentCaptor.forClass(List.class);
        verify(llmClient, times(2)).chatJson(messagesCaptor.capture());
        List<String> userMessages =
                messagesCaptor.getAllValues().stream().map(msgs -> msgs.get(1).content()).toList();

        assertThat(userMessages)
                .anySatisfy(msg -> assertThat(msg).isEqualTo("This is the summary."));
        assertThat(userMessages)
                .anySatisfy(
                        msg -> {
                            assertThat(msg).contains("Fact one included");
                            assertThat(msg).doesNotContain("related-should-be-excluded");
                            assertThat(msg).doesNotContain("sources-should-be-excluded");
                        });
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(
                new AppProperties(
                        vault.toString(),
                        List.of("http://localhost:4200"),
                        new AppProperties.Embeddings(
                                "http://embeddings:8080",
                                "multilingual-e5-small",
                                "",
                                384,
                                Duration.ofSeconds(1),
                                8),
                        new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                        new AppProperties.Telegram("", ""),
                        null,
                        null,
                        null,
                        null));
    }
}
