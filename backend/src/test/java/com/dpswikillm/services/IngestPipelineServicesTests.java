package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.config.GitProperties;
import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.domain.ConnectionCandidateSource;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.dto.ReviewCandidateDecision;
import com.dpswikillm.dto.ReviewRequest;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ChatMessage;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.OperationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

class IngestPipelineServicesTests {
    @TempDir
    Path vault;

    @BeforeEach
    void initGit() throws Exception {
        git("init");
        git("config", "user.name", "Test User");
        git("config", "user.email", "test@example.local");
        Files.writeString(vault.resolve("README.md"), "initial\n");
        git("add", "README.md");
        git("commit", "-m", "initial");
    }

    @Test
    void markdownUploadWritesRawInboxAndNormalizerRejectsNonRaw() throws Exception {
        RawIntakeService intake = new RawIntakeService(resolver(), mock(WebExtractorClient.class));
        String rawPath = intake.ingestFile(new MockMultipartFile(
                "file", "note.md", "text/markdown", "# Uploaded\n\nBody".getBytes(StandardCharsets.UTF_8)));

        assertThat(rawPath).startsWith("raw/inbox/");
        assertThat(new SourceNormalizer(resolver()).normalize(rawPath).title()).isEqualTo("Uploaded");
        assertThatThrownBy(() -> new SourceNormalizer(resolver()).normalize("wiki/sources/bad.md"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("raw/**");
    }

    @Test
    void sourceNoteCleaningRejectsMissingRequiredFields() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/missing.md"), "# Missing");
        PromptService ps = mock(PromptService.class);
        when(ps.getText(anyString())).thenReturn("system prompt");
        SourceNoteLlmService service = new SourceNoteLlmService(
                messages -> "{\"summary\":\"ok\"}",
                new JsonExtractionService(new ObjectMapper()),
                ps);

        assertThatThrownBy(() -> service.clean(new SourceNormalizer(resolver()).normalize("raw/inbox/missing.md")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("shape validation");
    }

    @Test
    void guardrailTurnsUnsafeActionIntoNoop() {
        MutationGuardrailService guardrail = new MutationGuardrailService(resolver());
        MutationPlan plan = new MutationPlan("p1", List.of(new MutationAction(
                MutationActionType.create,
                "wiki/topics/generated.md",
                "Generated",
                Map.of(),
                Map.of("Summary", List.of("Bad")),
                "key")));

        var result = guardrail.guardrail(plan, "raw/inbox/a.md", "wiki/sources/source.md");

        assertThat(result.rejections()).hasSize(1);
        assertThat(result.plan().pageActions().getFirst().action()).isEqualTo(MutationActionType.noop);
    }

    @Test
    void ingestPipelineCreatesBaselineSourceNoteAndCommit() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");
        git("add", "raw/inbox/input.md");
        git("commit", "-m", "raw fixture");
        String before = git("rev-parse", "HEAD");

        IngestPipelineService pipeline = pipeline();
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");
        job.setQueuePosition(1);

        pipeline.run(job);

        assertThat(Files.walk(vault.resolve("wiki/sources"))
                .filter(Files::isRegularFile)
                .toList()).hasSize(1);
        assertThat(Files.readString(vault.resolve("INDEX.md"))).contains("Fixture");
        assertThat(git("rev-parse", "HEAD")).isNotEqualTo(before);
        assertThat(git("rev-list", "--count", before + "..HEAD")).isEqualTo("1");
    }

    @Test
    void ingestPipelineFailureRollsBackPartialVaultWrites() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");
        git("add", "raw/inbox/input.md");
        git("commit", "-m", "raw fixture");
        String before = git("rev-parse", "HEAD");

        IngestPipelineService pipeline = pipeline(new FailingEmbeddingClient());
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");

        assertThatThrownBy(() -> pipeline.run(job)).isInstanceOf(RuntimeException.class);

        assertThat(git("rev-parse", "HEAD")).isEqualTo(before);
        assertThat(Files.exists(vault.resolve("wiki"))).isFalse();
    }

    @Test
    void validatedIngestPausesForGuidedReviewCandidates() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");
        git("add", "raw/inbox/input.md");
        git("commit", "-m", "raw fixture");

        JobConnectionCandidate candidate = candidate("wiki/concepts/existing.md", "wiki/sources/fixture.md");
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        when(discovery.discoverAndPersist(any(), any(), anyString(), any())).thenReturn(List.of(candidate));
        GuidedReviewService guidedReview = mock(GuidedReviewService.class);
        when(guidedReview.applyAccepted(any(Job.class), any(), any(), anyBoolean())).thenReturn(MutationResult.empty("mock"));
        PipelineHarness harness = pipeline(new StubEmbeddingClient(), discovery, guidedReview);

        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.validated);
        job.setPayloadRef("raw/inbox/input.md");

        harness.pipeline().run(job);

        verify(harness.lifecycle()).awaitingReview(any(Job.class), anyString(), anyString());
        verify(guidedReview, never()).applyAccepted(any(Job.class), any(), any(), anyBoolean());
    }

    @Test
    void unattendedIngestAutoAppliesAcceptedCandidates() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");
        git("add", "raw/inbox/input.md");
        git("commit", "-m", "raw fixture");

        JobConnectionCandidate candidate = candidate("wiki/concepts/existing.md", "wiki/sources/fixture.md");
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        when(discovery.discoverAndPersist(any(), any(), anyString(), any())).thenReturn(List.of(candidate));
        GuidedReviewService guidedReview = mock(GuidedReviewService.class);
        when(guidedReview.applyAccepted(any(Job.class), any(), any(), anyBoolean())).thenReturn(new MutationResult(
                "auto", List.of(), List.of("wiki/concepts/existing.md"), List.of(), List.of()));
        PipelineHarness harness = pipeline(new StubEmbeddingClient(), discovery, guidedReview);

        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");

        harness.pipeline().run(job);

        assertThat(candidate.getDecision()).isEqualTo(ConnectionCandidateDecision.accepted);
        verify(guidedReview).applyAccepted(any(Job.class), any(), anyString(), anyBoolean());
    }

    @Test
    void unattendedIngestWithConnectionsProducesExactlyOneCommit() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");
        Files.writeString(vault.resolve("wiki/concepts/existing.md"), """
                ---
                type: concept
                title: Existing
                ---

                # Existing

                ## Summary
                An existing concept.
                """);
        git("add", ".");
        git("commit", "-m", "raw and concept fixtures");
        String before = git("rev-parse", "HEAD");

        JobConnectionCandidate candidate = candidate("wiki/concepts/existing.md", "wiki/sources/fixture.md");
        ReflectionTestUtils.setField(candidate, "id", UUID.randomUUID());
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        when(discovery.discoverAndPersist(any(), any(), anyString(), any())).thenReturn(List.of(candidate));

        VaultPathResolver resolver = resolver();
        FakeRepository documentRepository = new FakeRepository();
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.save(any(Job.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jobRepository.findById(any())).thenAnswer(invocation -> {
            Job j = new Job();
            ReflectionTestUtils.setField(j, "id", invocation.getArgument(0));
            return Optional.of(j);
        });
        JobConnectionCandidateRepository candidateRepository = mock(JobConnectionCandidateRepository.class);
        when(candidateRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        OperationRepository operationRepository = mock(OperationRepository.class);
        when(operationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any())).thenAnswer(invocation -> new Job());
        ReindexService reindex = new ReindexService(resolver, new MarkdownService(), documentRepository);
        EmbeddingIndexService embeddings = new EmbeddingIndexService(documentRepository, new StubEmbeddingClient(), properties());
        GuidedReviewService realGuidedReview = new GuidedReviewService(
                jobRepository, candidateRepository, operationRepository,
                new MutationApplier(resolver, new MarkdownService(), new ObjectMapper()),
                reindex, embeddings,
                new GitService(resolver, new GitProperties("Test User", "test@example.local")),
                lifecycle, new ObjectMapper());

        LlmClient llm = new SequencedLlmClient();
        PromptService ps = mock(PromptService.class);
        when(ps.getText(anyString())).thenReturn("system prompt");
        IngestPipelineService pipeline = new IngestPipelineService(
                new SourceNormalizer(resolver),
                new SourceNoteLlmService(llm, new JsonExtractionService(new ObjectMapper()), ps),
                new SourceNotePlanner(),
                new LlmMutationPlanService(llm, new JsonExtractionService(new ObjectMapper()), new ObjectMapper(), ps),
                new MutationGuardrailService(resolver),
                new MutationApplier(resolver, new MarkdownService(), new ObjectMapper()),
                new RootIndexService(resolver),
                reindex, embeddings,
                new GitService(resolver, new GitProperties("Test User", "test@example.local")),
                resolver, lifecycle, jobRepository, discovery, realGuidedReview,
                new ObjectMapper().findAndRegisterModules());

        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");
        job.setQueuePosition(1);

        pipeline.run(job);

        assertThat(git("rev-list", "--count", before + "..HEAD")).isEqualTo("1");
    }

    @Test
    void guidedReviewAppliesAcceptedAndManualConnectionsIdempotently() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.createDirectories(vault.resolve("wiki/sources"));
        Files.writeString(vault.resolve("wiki/concepts/target.md"), """
                ---
                type: concept
                title: Target
                ---

                # Target

                ## Summary
                Existing target.

                ## Related
                - [[Existing]]
                """);
        Files.writeString(vault.resolve("wiki/concepts/manual.md"), """
                ---
                type: concept
                title: Manual
                ---

                # Manual

                ## Summary
                Existing manual target.
                """);
        Files.writeString(vault.resolve("wiki/sources/source.md"), "# Source\n\n## Summary\nGrounding.\n");
        git("add", "wiki");
        git("commit", "-m", "wiki fixture");

        UUID jobId = UUID.randomUUID();
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", jobId);
        job.setType(JobType.INGEST);
        job.setMode(JobMode.validated);

        JobConnectionCandidate persisted = candidate("wiki/concepts/target.md", "wiki/sources/source.md");
        ReflectionTestUtils.setField(persisted, "id", UUID.randomUUID());
        persisted.setJobId(jobId);

        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        when(jobRepository.save(any(Job.class))).thenAnswer(invocation -> invocation.getArgument(0));
        JobConnectionCandidateRepository candidateRepository = mock(JobConnectionCandidateRepository.class);
        when(candidateRepository.findByJobIdOrderByCreatedAtAsc(jobId)).thenReturn(List.of(persisted));
        when(candidateRepository.save(any(JobConnectionCandidate.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(candidateRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        OperationRepository operationRepository = mock(OperationRepository.class);
        when(operationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        FakeRepository documentRepository = new FakeRepository();
        ReindexService reindex = new ReindexService(resolver(), new MarkdownService(), documentRepository);
        EmbeddingIndexService embeddings = new EmbeddingIndexService(documentRepository, new StubEmbeddingClient(), properties());

        GuidedReviewService reviewService = new GuidedReviewService(
                jobRepository,
                candidateRepository,
                operationRepository,
                new MutationApplier(resolver(), new MarkdownService(), new ObjectMapper()),
                reindex,
                embeddings,
                new GitService(resolver(), new GitProperties("Test User", "test@example.local")),
                mock(JobLifecycleService.class),
                new ObjectMapper());

        ReviewRequest request = new ReviewRequest(
                List.of(new ReviewCandidateDecision(persisted.getId(), ConnectionCandidateDecision.accepted)),
                List.of("wiki/concepts/manual.md"));

        MutationResult first = reviewService.review(jobId, request);
        MutationResult second = reviewService.applyAccepted(job, List.of(persisted), "guided-review-" + jobId, true);

        assertThat(first.updated()).contains("wiki/concepts/target.md", "wiki/concepts/manual.md");
        assertThat(second.idempotentHits()).contains("review:" + jobId + ":wiki/concepts/target.md:wiki/sources/source.md");
        String target = Files.readString(vault.resolve("wiki/concepts/target.md"));
        assertThat(target).contains("[[wiki/sources/source.md]]");
        assertThat(occurrences(target, "[[wiki/sources/source.md]]")).isEqualTo(2);
        assertThat(Files.readString(vault.resolve("wiki/concepts/manual.md")))
                .contains("[[wiki/sources/source.md]]");
    }

    private IngestPipelineService pipeline() {
        return pipeline(new StubEmbeddingClient());
    }

    private IngestPipelineService pipeline(EmbeddingClient embeddingClient) {
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        GuidedReviewService guidedReview = mock(GuidedReviewService.class);
        try {
            when(guidedReview.applyAccepted(any(Job.class), any(), any(), anyBoolean())).thenReturn(MutationResult.empty("mock"));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        return pipeline(embeddingClient, discovery, guidedReview).pipeline();
    }

    private PipelineHarness pipeline(EmbeddingClient embeddingClient, ConnectionDiscoveryService discovery,
                                     GuidedReviewService guidedReview) {
        VaultPathResolver resolver = resolver();
        FakeRepository documentRepository = new FakeRepository();
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.save(any(Job.class))).thenAnswer(invocation -> invocation.getArgument(0));
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any())).thenAnswer(invocation -> new Job());

        LlmClient llm = new SequencedLlmClient();
        PromptService ps = mock(PromptService.class);
        when(ps.getText(anyString())).thenReturn("system prompt");
        SourceNoteLlmService sourceNoteLlm = new SourceNoteLlmService(llm, new JsonExtractionService(new ObjectMapper()), ps);
        LlmMutationPlanService planService = new LlmMutationPlanService(llm, new JsonExtractionService(new ObjectMapper()), new ObjectMapper(), ps);
        ReindexService reindex = new ReindexService(resolver, new MarkdownService(), documentRepository);
        EmbeddingIndexService embeddings = new EmbeddingIndexService(documentRepository, embeddingClient, properties());
        return new PipelineHarness(new IngestPipelineService(
                new SourceNormalizer(resolver),
                sourceNoteLlm,
                new SourceNotePlanner(),
                planService,
                new MutationGuardrailService(resolver),
                new MutationApplier(resolver, new MarkdownService(), new ObjectMapper()),
                new RootIndexService(resolver),
                reindex,
                embeddings,
                new GitService(resolver, new GitProperties("Test User", "test@example.local")),
                resolver,
                lifecycle,
                jobRepository,
                discovery,
                guidedReview,
                new ObjectMapper().findAndRegisterModules()), lifecycle);
    }

    private int occurrences(String text, String needle) {
        int count = 0;
        int index = 0;
        while ((index = text.indexOf(needle, index)) >= 0) {
            count += 1;
            index += needle.length();
        }
        return count;
    }

    private JobConnectionCandidate candidate(String targetPath, String sourceNotePath) {
        JobConnectionCandidate candidate = new JobConnectionCandidate();
        candidate.setJobId(UUID.randomUUID());
        candidate.setTargetPath(targetPath);
        candidate.setProposedLink(sourceNotePath);
        candidate.setProposedSection("Related");
        candidate.setSource(ConnectionCandidateSource.semantic);
        candidate.setScore(0.91);
        candidate.setDecision(ConnectionCandidateDecision.pending);
        return candidate;
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(properties());
    }

    private AppProperties properties() {
        return new AppProperties(vault, List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null);
    }

    private String git(String... args) throws Exception {
        ArrayList<String> command = new ArrayList<>();
        command.add("git");
        command.addAll(List.of(args));
        Process process = new ProcessBuilder(command).directory(vault.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        if (process.waitFor() != 0) {
            throw new IllegalStateException(output);
        }
        return output.trim();
    }

    private static class SequencedLlmClient implements LlmClient {
        int calls;

        @Override
        public String chat(List<ChatMessage> messages) {
            calls += 1;
            if (calls == 1) {
                return "{\"summary\":\"Fixture summary\",\"raw_context\":\"Fixture context\",\"extracted_claims\":[\"A grounded fact\"],\"open_questions\":[]}";
            }
            return "{\"plan_id\":\"optional\",\"page_actions\":[]}";
        }
    }

    private static class StubEmbeddingClient implements EmbeddingClient {
        @Override
        public List<float[]> embedPassages(List<String> texts) {
            return texts.stream().map(text -> new float[] {1, 0}).toList();
        }

        @Override
        public float[] embedQuery(String text) {
            return new float[] {1, 0};
        }
    }

    private static class FailingEmbeddingClient implements EmbeddingClient {
        @Override
        public List<float[]> embedPassages(List<String> texts) {
            throw new RuntimeException("embedding failed");
        }

        @Override
        public float[] embedQuery(String text) {
            throw new RuntimeException("embedding failed");
        }
    }

    private static class FakeRepository implements DocumentIndexRepository {
        List<com.dpswikillm.domain.DocumentRecord> documents = new ArrayList<>();
        Map<UUID, String> hashes = new LinkedHashMap<>();

        @Override
        public void replaceDocuments(List<com.dpswikillm.domain.DocumentRecord> documents) {
            this.documents = new ArrayList<>(documents);
        }

        @Override
        public List<com.dpswikillm.domain.DocumentRecord> findAllDocuments() {
            return documents;
        }

        @Override
        public Map<UUID, String> findEmbeddingHashes(String model) {
            return hashes;
        }

        @Override
        public void upsertEmbedding(UUID documentId, String model, int dimension, float[] embedding, String normalizedTextHash) {
            hashes.put(documentId, normalizedTextHash);
        }

        @Override
        public void pruneEmbeddingsNotIn(String model, List<UUID> documentIds) {
            hashes.keySet().removeIf(id -> !documentIds.contains(id));
        }

        @Override
        public List<SearchResult> semanticSearch(float[] queryVector, int limit) {
            return List.of();
        }

        @Override
        public List<SearchResult> lexicalLookup(String query, int limit) {
            return List.of();
        }
    }

    private record PipelineHarness(IngestPipelineService pipeline, JobLifecycleService lifecycle) {}
}
