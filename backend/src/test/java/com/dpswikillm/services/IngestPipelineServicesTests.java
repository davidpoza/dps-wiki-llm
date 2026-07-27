package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.domain.ConnectionCandidateSource;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ChatMessage;
import com.dpswikillm.dto.ReviewCandidateDecision;
import com.dpswikillm.dto.ReviewRequest;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.OperationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
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
    @TempDir Path vault;

    private SnapshotServiceTests.FakeSnapshotRepository snapshotRepo;
    private SnapshotServiceTests.FakeSnapshotFileRepository snapshotFileRepo;
    private SnapshotService snapshotService;

    @BeforeEach
    void setUp() {
        snapshotRepo = new SnapshotServiceTests.FakeSnapshotRepository();
        snapshotFileRepo = new SnapshotServiceTests.FakeSnapshotFileRepository();
        JobRepository jobRepo = mock(JobRepository.class);
        when(jobRepo.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));
        snapshotService = new SnapshotService(snapshotRepo, snapshotFileRepo, resolver(), jobRepo);
    }

    @Test
    void markdownUploadWritesRawInboxAndNormalizerRejectsNonRaw() throws Exception {
        RawIntakeService intake = new RawIntakeService(resolver(), mock(WebExtractorClient.class));
        String rawPath =
                intake.ingestFile(
                        new MockMultipartFile(
                                "file",
                                "note.md",
                                "text/markdown",
                                "# Uploaded\n\nBody".getBytes(StandardCharsets.UTF_8)));

        assertThat(rawPath).startsWith("raw/inbox/");
        assertThat(new SourceNormalizer(resolver()).normalize(rawPath).title())
                .isEqualTo("Uploaded");
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
        SourceNoteLlmService service =
                new SourceNoteLlmService(
                        messages -> "{\"summary\":\"ok\"}",
                        new JsonExtractionService(new ObjectMapper()),
                        ps,
                        new RetryingLlmExecutor());

        assertThatThrownBy(
                        () ->
                                service.clean(
                                        new SourceNormalizer(resolver())
                                                .normalize("raw/inbox/missing.md")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("shape validation");
    }

    @Test
    void guardrailTurnsUnsafeActionIntoNoop() {
        MutationGuardrailService guardrail = new MutationGuardrailService(resolver());
        MutationPlan plan =
                new MutationPlan(
                        "p1",
                        List.of(
                                MutationAction.merge(
                                        MutationActionType.create,
                                        "wiki/topics/generated.md",
                                        "Generated",
                                        Map.of(),
                                        Map.of("Summary", List.of("Bad")),
                                        "key")));

        var result = guardrail.guardrail(plan, "raw/inbox/a.md", "wiki/sources/source.md");

        assertThat(result.rejections()).hasSize(1);
        assertThat(result.plan().pageActions().getFirst().action())
                .isEqualTo(MutationActionType.noop);
    }

    @Test
    void ingestPipelineCreatesBaselineSourceNote() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");

        IngestPipelineService pipeline = pipeline();
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");
        job.setQueuePosition(1);

        pipeline.run(job);

        assertThat(Files.walk(vault.resolve("wiki/sources")).filter(Files::isRegularFile).toList())
                .hasSize(1);
        assertThat(Files.readString(vault.resolve("INDEX.md"))).contains("Fixture");
        assertThat(job.getSnapshotId()).isNotNull();
    }

    @Test
    void ingestPipelineFailureRollsBackPartialVaultWrites() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");

        IngestPipelineService pipeline = pipeline(new FailingEmbeddingClient());
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");

        assertThatThrownBy(() -> pipeline.run(job)).isInstanceOf(RuntimeException.class);

        assertThat(Files.exists(vault.resolve("wiki"))).isFalse();
        assertThat(job.getSnapshotId()).isNull();
    }

    @Test
    void validatedIngestPausesForGuidedReviewCandidates() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");

        JobConnectionCandidate candidate =
                candidate("wiki/concepts/existing.md", "wiki/sources/fixture.md");
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        when(discovery.discoverAndPersist(any(), any(), anyString(), any()))
                .thenReturn(List.of(candidate));
        GuidedReviewService guidedReview = mock(GuidedReviewService.class);
        when(guidedReview.applyAccepted(any(Job.class), any(), any(), anyBoolean()))
                .thenReturn(MutationResult.empty("mock"));
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

        JobConnectionCandidate candidate =
                candidate("wiki/concepts/existing.md", "wiki/sources/fixture.md");
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        when(discovery.discoverAndPersist(any(), any(), anyString(), any()))
                .thenReturn(List.of(candidate));
        GuidedReviewService guidedReview = mock(GuidedReviewService.class);
        when(guidedReview.applyAccepted(any(Job.class), any(), any(), anyBoolean()))
                .thenReturn(
                        new MutationResult(
                                "auto",
                                List.of(),
                                List.of("wiki/concepts/existing.md"),
                                List.of(),
                                List.of()));
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
    void unattendedIngestWithConnectionsFinalizesSnapshot() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.createDirectories(vault.resolve("wiki/sources"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");
        Files.writeString(
                vault.resolve("wiki/concepts/existing.md"),
                """
                ---
                type: concept
                title: Existing
                ---

                # Existing

                ## Summary
                An existing concept.
                """);
        Files.writeString(
                vault.resolve("wiki/sources/fixture.md"),
                """
                ---
                type: source
                title: Fixture
                ---

                # Fixture

                ## Summary
                A grounded fact.
                """);

        JobConnectionCandidate candidate =
                candidate("wiki/concepts/existing.md", "wiki/sources/fixture.md");
        ReflectionTestUtils.setField(candidate, "id", UUID.randomUUID());
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        when(discovery.discoverAndPersist(any(), any(), anyString(), any()))
                .thenReturn(List.of(candidate));

        VaultPathResolver resolver = resolver();
        FakeDocumentRepository documentRepository = new FakeDocumentRepository();
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.save(any(Job.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(jobRepository.findById(any()))
                .thenAnswer(
                        invocation -> {
                            Job j = new Job();
                            ReflectionTestUtils.setField(j, "id", invocation.getArgument(0));
                            return Optional.of(j);
                        });
        JobConnectionCandidateRepository candidateRepository =
                mock(JobConnectionCandidateRepository.class);
        when(candidateRepository.saveAll(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        OperationRepository operationRepository = mock(OperationRepository.class);
        when(operationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any()))
                .thenAnswer(invocation -> new Job());
        ReindexService reindex =
                new ReindexService(resolver, new MarkdownService(), documentRepository);
        EmbeddingIndexService embeddings =
                new EmbeddingIndexService(
                        documentRepository,
                        new StubEmbeddingClient(),
                        properties(),
                        new MarkdownService());
        GuidedReviewService realGuidedReview =
                new GuidedReviewService(
                        jobRepository,
                        candidateRepository,
                        operationRepository,
                        new MutationApplier(resolver, new MarkdownService(), new ObjectMapper()),
                        reindex,
                        embeddings,
                        snapshotService,
                        lifecycle,
                        new ObjectMapper());

        LlmClient llm = new SequencedLlmClient();
        PromptService ps = mock(PromptService.class);
        when(ps.getText(anyString())).thenReturn("system prompt");
        ConceptResolutionService conceptRes = mock(ConceptResolutionService.class);
        when(conceptRes.resolve(any(MutationPlan.class)))
                .thenAnswer(
                        inv ->
                                new com.dpswikillm.dto.ConceptResolutionResult(
                                        inv.getArgument(0), List.of()));
        IngestPipelineService pipeline =
                new IngestPipelineService(
                        new SourceNormalizer(resolver),
                        new SourceNoteLlmService(
                                llm,
                                new JsonExtractionService(new ObjectMapper()),
                                ps,
                                new RetryingLlmExecutor()),
                        new SourceNotePlanner(),
                        new LlmMutationPlanService(
                                llm,
                                new JsonExtractionService(new ObjectMapper()),
                                new ObjectMapper(),
                                ps,
                                new RetryingLlmExecutor()),
                        new MutationGuardrailService(resolver),
                        new MutationApplier(resolver, new MarkdownService(), new ObjectMapper()),
                        new RootIndexService(resolver),
                        reindex,
                        embeddings,
                        snapshotService,
                        resolver,
                        lifecycle,
                        jobRepository,
                        discovery,
                        realGuidedReview,
                        conceptRes,
                        new ObjectMapper().findAndRegisterModules());

        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");
        job.setQueuePosition(1);

        pipeline.run(job);

        assertThat(job.getSnapshotId()).isNotNull();
        assertThat(
                        snapshotRepo
                                .findById(job.getSnapshotId())
                                .map(com.dpswikillm.domain.Snapshot::getStatus))
                .contains("COMPLETE");
        // Bidirectional linking: the target note backlinks to the source note, and the source note
        // links back out to the target (reverse link applied inside applyAccepted, both flows).
        assertThat(Files.readString(vault.resolve("wiki/concepts/existing.md")))
                .contains("[[wiki/sources/fixture.md]]");
        assertThat(Files.readString(vault.resolve("wiki/sources/fixture.md")))
                .contains("[[wiki/concepts/existing.md]]");
    }

    @Test
    void guidedReviewAppliesAcceptedAndManualConnectionsIdempotently() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.createDirectories(vault.resolve("wiki/sources"));
        Files.writeString(
                vault.resolve("wiki/concepts/target.md"),
                """
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
        Files.writeString(
                vault.resolve("wiki/concepts/manual.md"),
                """
                ---
                type: concept
                title: Manual
                ---

                # Manual

                ## Summary
                Existing manual target.
                """);
        Files.writeString(
                vault.resolve("wiki/sources/source.md"), "# Source\n\n## Summary\nGrounding.\n");

        UUID jobId = UUID.randomUUID();
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", jobId);
        job.setType(JobType.INGEST);
        job.setMode(JobMode.validated);

        JobConnectionCandidate persisted =
                candidate("wiki/concepts/target.md", "wiki/sources/source.md");
        ReflectionTestUtils.setField(persisted, "id", UUID.randomUUID());
        persisted.setJobId(jobId);

        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        when(jobRepository.save(any(Job.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        JobConnectionCandidateRepository candidateRepository =
                mock(JobConnectionCandidateRepository.class);
        when(candidateRepository.findByJobIdOrderByCreatedAtAsc(jobId))
                .thenReturn(List.of(persisted));
        when(candidateRepository.save(any(JobConnectionCandidate.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(candidateRepository.saveAll(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        OperationRepository operationRepository = mock(OperationRepository.class);
        when(operationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        FakeDocumentRepository documentRepository = new FakeDocumentRepository();
        ReindexService reindex =
                new ReindexService(resolver(), new MarkdownService(), documentRepository);
        EmbeddingIndexService embeddings =
                new EmbeddingIndexService(
                        documentRepository,
                        new StubEmbeddingClient(),
                        properties(),
                        new MarkdownService());

        GuidedReviewService reviewService =
                new GuidedReviewService(
                        jobRepository,
                        candidateRepository,
                        operationRepository,
                        new MutationApplier(resolver(), new MarkdownService(), new ObjectMapper()),
                        reindex,
                        embeddings,
                        snapshotService,
                        mock(JobLifecycleService.class),
                        new ObjectMapper());

        ReviewRequest request =
                new ReviewRequest(
                        List.of(
                                new ReviewCandidateDecision(
                                        persisted.getId(), ConnectionCandidateDecision.accepted)),
                        List.of("wiki/concepts/manual.md"));

        MutationResult first = reviewService.review(jobId, request);
        MutationResult second =
                reviewService.applyAccepted(
                        job, List.of(persisted), "guided-review-" + jobId, true);

        assertThat(first.updated()).contains("wiki/concepts/target.md", "wiki/concepts/manual.md");
        assertThat(second.idempotentHits())
                .contains("review:" + jobId + ":wiki/concepts/target.md:wiki/sources/source.md");
        String target = Files.readString(vault.resolve("wiki/concepts/target.md"));
        assertThat(target).contains("[[wiki/sources/source.md]]");
        assertThat(occurrences(target, "[[wiki/sources/source.md]]")).isEqualTo(2);
        assertThat(Files.readString(vault.resolve("wiki/concepts/manual.md")))
                .contains("[[wiki/sources/source.md]]");
        // Reverse link: guided review now links the source note back out to each accepted/manual
        // target.
        String source = Files.readString(vault.resolve("wiki/sources/source.md"));
        assertThat(source).contains("[[wiki/concepts/target.md]]", "[[wiki/concepts/manual.md]]");
        // Idempotent: re-applying the same connection does not duplicate the reverse link.
        assertThat(occurrences(source, "[[wiki/concepts/target.md]]")).isEqualTo(1);
    }

    @Test
    void conceptResolutionServiceIsCalledDuringIngest() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(vault.resolve("raw/inbox/input.md"), "# Fixture\n\nA grounded fact.");

        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        when(discovery.discoverAndPersist(any(), any(), any(), any())).thenReturn(List.of());
        GuidedReviewService guidedReview = mock(GuidedReviewService.class);
        try {
            when(guidedReview.applyAccepted(any(Job.class), any(), any(), anyBoolean()))
                    .thenReturn(MutationResult.empty("mock"));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        VaultPathResolver resolver = resolver();
        FakeDocumentRepository documentRepository = new FakeDocumentRepository();
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.save(any(Job.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any()))
                .thenAnswer(invocation -> new Job());
        LlmClient llm = new SequencedLlmClient();
        PromptService ps = mock(PromptService.class);
        when(ps.getText(anyString())).thenReturn("system prompt");
        SourceNoteLlmService sourceNoteLlm =
                new SourceNoteLlmService(
                        llm,
                        new JsonExtractionService(new ObjectMapper()),
                        ps,
                        new RetryingLlmExecutor());
        LlmMutationPlanService planService =
                new LlmMutationPlanService(
                        llm,
                        new JsonExtractionService(new ObjectMapper()),
                        new ObjectMapper(),
                        ps,
                        new RetryingLlmExecutor());
        ReindexService reindex =
                new ReindexService(resolver, new MarkdownService(), documentRepository);
        EmbeddingIndexService embeddings =
                new EmbeddingIndexService(
                        documentRepository,
                        new StubEmbeddingClient(),
                        properties(),
                        new MarkdownService());

        ConceptResolutionService conceptResolution = mock(ConceptResolutionService.class);
        when(conceptResolution.resolve(any(MutationPlan.class)))
                .thenReturn(
                        new com.dpswikillm.dto.ConceptResolutionResult(
                                new MutationPlan("resolved", List.of()), List.of()));

        IngestPipelineService pipeline =
                new IngestPipelineService(
                        new SourceNormalizer(resolver),
                        sourceNoteLlm,
                        new SourceNotePlanner(),
                        planService,
                        new MutationGuardrailService(resolver),
                        new MutationApplier(resolver, new MarkdownService(), new ObjectMapper()),
                        new RootIndexService(resolver),
                        reindex,
                        embeddings,
                        snapshotService,
                        resolver,
                        lifecycle,
                        jobRepository,
                        discovery,
                        guidedReview,
                        conceptResolution,
                        new ObjectMapper().findAndRegisterModules());

        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        job.setType(JobType.INGEST);
        job.setMode(JobMode.unattended);
        job.setPayloadRef("raw/inbox/input.md");
        job.setQueuePosition(1);

        pipeline.run(job);

        verify(conceptResolution).resolve(any(MutationPlan.class));
        verify(discovery).discoverAndPersist(any(), any(), any(), any(MutationPlan.class));
    }

    private IngestPipelineService pipeline() {
        return pipeline(new StubEmbeddingClient());
    }

    private IngestPipelineService pipeline(EmbeddingClient embeddingClient) {
        ConnectionDiscoveryService discovery = mock(ConnectionDiscoveryService.class);
        GuidedReviewService guidedReview = mock(GuidedReviewService.class);
        try {
            when(guidedReview.applyAccepted(any(Job.class), any(), any(), anyBoolean()))
                    .thenReturn(MutationResult.empty("mock"));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        return pipeline(embeddingClient, discovery, guidedReview).pipeline();
    }

    private PipelineHarness pipeline(
            EmbeddingClient embeddingClient,
            ConnectionDiscoveryService discovery,
            GuidedReviewService guidedReview) {
        VaultPathResolver resolver = resolver();
        FakeDocumentRepository documentRepository = new FakeDocumentRepository();
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.save(any(Job.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        when(lifecycle.transition(any(), any(JobStatus.class), any(), any()))
                .thenAnswer(invocation -> new Job());

        LlmClient llm = new SequencedLlmClient();
        PromptService ps = mock(PromptService.class);
        when(ps.getText(anyString())).thenReturn("system prompt");
        SourceNoteLlmService sourceNoteLlm =
                new SourceNoteLlmService(
                        llm,
                        new JsonExtractionService(new ObjectMapper()),
                        ps,
                        new RetryingLlmExecutor());
        LlmMutationPlanService planService =
                new LlmMutationPlanService(
                        llm,
                        new JsonExtractionService(new ObjectMapper()),
                        new ObjectMapper(),
                        ps,
                        new RetryingLlmExecutor());
        ReindexService reindex =
                new ReindexService(resolver, new MarkdownService(), documentRepository);
        EmbeddingIndexService embeddings =
                new EmbeddingIndexService(
                        documentRepository, embeddingClient, properties(), new MarkdownService());
        ConceptResolutionService conceptResolution = mock(ConceptResolutionService.class);
        when(conceptResolution.resolve(any(MutationPlan.class)))
                .thenAnswer(
                        inv ->
                                new com.dpswikillm.dto.ConceptResolutionResult(
                                        inv.getArgument(0), List.of()));
        return new PipelineHarness(
                new IngestPipelineService(
                        new SourceNormalizer(resolver),
                        sourceNoteLlm,
                        new SourceNotePlanner(),
                        planService,
                        new MutationGuardrailService(resolver),
                        new MutationApplier(resolver, new MarkdownService(), new ObjectMapper()),
                        new RootIndexService(resolver),
                        reindex,
                        embeddings,
                        snapshotService,
                        resolver,
                        lifecycle,
                        jobRepository,
                        discovery,
                        guidedReview,
                        conceptResolution,
                        new ObjectMapper().findAndRegisterModules()),
                lifecycle);
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
        return new AppProperties(
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
                null);
    }

    private static class SequencedLlmClient implements LlmClient {
        int calls;

        @Override
        public String chat(List<ChatMessage> messages) {
            calls += 1;
            if (calls == 1) {
                return "{\"summary\":\"Fixture summary\",\"raw_context\":\"Fixture context\",\"extracted_claims\":[\"A grounded fact\"],\"open_questions\":[],\"keywords\":[\"fixture\",\"test\"]}";
            }
            return "{\"plan_id\":\"optional\",\"page_actions\":[]}";
        }
    }

    private static class StubEmbeddingClient implements EmbeddingClient {
        @Override
        public List<float[]> embedPassages(List<String> texts) {
            return texts.stream().map(t -> new float[] {1, 0}).toList();
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

    private static class FakeDocumentRepository implements DocumentIndexRepository {
        List<DocumentRecord> documents = new ArrayList<>();
        Map<UUID, String> hashes = new LinkedHashMap<>();

        @Override
        public void replaceDocuments(List<DocumentRecord> docs) {
            this.documents = new ArrayList<>(docs);
        }

        @Override
        public List<DocumentRecord> findAllDocuments() {
            return documents;
        }

        @Override
        public Map<UUID, String> findEmbeddingHashes(String model) {
            return hashes;
        }

        @Override
        public void upsertEmbedding(UUID id, String model, int dim, float[] emb, String hash) {
            hashes.put(id, hash);
        }

        @Override
        public void pruneEmbeddingsNotIn(String model, List<UUID> ids) {
            hashes.keySet().removeIf(id -> !ids.contains(id));
        }

        @Override
        public List<SearchResult> semanticSearch(float[] q, int limit) {
            return List.of();
        }

        @Override
        public List<SearchResult> semanticSearchByType(float[] q, String docType, int limit) {
            return List.of();
        }

        @Override
        public List<SearchResult> lexicalLookup(String q, int limit) {
            return List.of();
        }

        @Override
        public List<SimilarPair> findSimilarPairsByDocType(
                String model, String docType, double threshold) {
            return List.of();
        }

        @Override
        public List<DocumentRecord> findDocumentsByDocType(String docType) {
            return documents.stream().filter(d -> docType.equals(d.docType())).toList();
        }

        @Override
        public java.util.Set<String> findEmbeddedPathsByDocType(String model, String docType) {
            return java.util.Set.of();
        }

        @Override
        public Optional<Instant> findEmbeddingStatus(String path) {
            return Optional.empty();
        }

        @Override
        public Optional<Double> computeScore(String srcPath, String tgtPath) {
            return Optional.empty();
        }
    }

    private record PipelineHarness(IngestPipelineService pipeline, JobLifecycleService lifecycle) {}
}
