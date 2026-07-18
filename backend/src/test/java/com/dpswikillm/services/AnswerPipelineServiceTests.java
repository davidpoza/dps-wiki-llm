package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.AnswerRecord;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ChatMessage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

class AnswerPipelineServiceTests {
    @TempDir
    Path vault;

    @Test
    void answerPipelineWritesArtifactAndReturnsRecord() throws Exception {
        SemanticSearchService search = mock(SemanticSearchService.class);
        when(search.search(any(), any(int.class))).thenReturn(List.of(
                new SearchResult("wiki/concepts/foo.md", "Foo", "concept", 0.95, "The body of Foo")));

        LlmClient llm = messages -> "The answer based on Foo.";
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any())).thenAnswer(i -> new Job());

        PromptService prompts = promptService();
        AnswerPipelineService service = new AnswerPipelineService(search, llm, resolver(), lifecycle, prompts);

        Job job = job("What is Foo?");
        AnswerRecord record = service.run(job);

        assertThat(record.question()).isEqualTo("What is Foo?");
        assertThat(record.answer()).contains("The answer based on Foo.");
        assertThat(record.evidencePaths()).contains("wiki/concepts/foo.md");
        assertThat(record.shouldReviewForFeedback()).isTrue();
        assertThat(record.artifactPath()).startsWith("outputs/answer-");

        Path artifact = vault.resolve(record.artifactPath());
        assertThat(Files.exists(artifact)).isTrue();
        String content = Files.readString(artifact);
        assertThat(content).contains("What is Foo?");
        assertThat(content).contains("wiki/concepts/foo.md");
    }

    @Test
    void emptyIndexProducesAnswerWithNoEvidence() throws Exception {
        SemanticSearchService search = mock(SemanticSearchService.class);
        when(search.search(any(), any(int.class))).thenReturn(List.of());

        LlmClient llm = messages -> "I have no context documents to answer from.";
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any())).thenAnswer(i -> new Job());

        AnswerPipelineService service = new AnswerPipelineService(search, llm, resolver(), lifecycle, promptService());

        Job job = job("unknown question");
        AnswerRecord record = service.run(job);

        assertThat(record.evidencePaths()).isEmpty();
        assertThat(Files.exists(vault.resolve(record.artifactPath()))).isTrue();
    }

    @Test
    void artifactIsCleanedUpOnLaterFailure() throws Exception {
        SemanticSearchService search = mock(SemanticSearchService.class);
        when(search.search(any(), any(int.class))).thenReturn(List.of());

        LlmClient llm = messages -> { throw new RuntimeException("LLM unavailable"); };
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any())).thenAnswer(i -> new Job());

        AnswerPipelineService service = new AnswerPipelineService(search, llm, resolver(), lifecycle, promptService());

        Job job = job("some question");
        assertThatThrownBy(() -> service.run(job)).hasMessageContaining("LLM unavailable");

        Path outputDir = vault.resolve("outputs");
        boolean anyArtifact = Files.exists(outputDir) &&
                Files.list(outputDir).findAny().isPresent();
        assertThat(anyArtifact).isFalse();
    }

    @Test
    void noWikiMutationDuringAnswerRun() throws Exception {
        SemanticSearchService search = mock(SemanticSearchService.class);
        when(search.search(any(), any(int.class))).thenReturn(List.of(
                new SearchResult("wiki/sources/doc.md", "Doc", "source", 0.9, "Content")));
        LlmClient llm = messages -> "Answer.";
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any())).thenAnswer(i -> new Job());

        AnswerPipelineService service = new AnswerPipelineService(search, llm, resolver(), lifecycle, promptService());
        service.run(job("test?"));

        assertThat(Files.exists(vault.resolve("wiki"))).isFalse();
    }

    private PromptService promptService() {
        PromptService ps = mock(PromptService.class);
        when(ps.getText(any())).thenReturn("You are a knowledge assistant. Answer only from context.");
        return ps;
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(new AppProperties(vault.toString(), List.of(),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://localhost", "model", ""),
                new AppProperties.Telegram("", ""), null, null, null, null));
    }

    private Job job(String question) {
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.ANSWER);
        job.setPayloadRef(question);
        job.setQueuePosition(1);
        return job;
    }
}
