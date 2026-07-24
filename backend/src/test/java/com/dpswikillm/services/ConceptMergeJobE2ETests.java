package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ConceptDedupGroup;
import com.dpswikillm.dto.ConceptMergeRequest;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.DocumentIndexRepository.SimilarPair;
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
import org.springframework.test.util.ReflectionTestUtils;

class ConceptMergeJobE2ETests {
    @TempDir Path vault;

    private SnapshotServiceTests.FakeSnapshotRepository snapshotRepo;
    private SnapshotServiceTests.FakeSnapshotFileRepository snapshotFileRepo;
    private SnapshotService snapshotService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        snapshotRepo = new SnapshotServiceTests.FakeSnapshotRepository();
        snapshotFileRepo = new SnapshotServiceTests.FakeSnapshotFileRepository();
        snapshotFileRepo.setSnapshotRepo(snapshotRepo);
        JobRepository jobRepo = mock(JobRepository.class);
        when(jobRepo.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));
        snapshotService = new SnapshotService(snapshotRepo, snapshotFileRepo, resolver(), jobRepo);
        objectMapper = new ObjectMapper();
    }

    @Test
    void mergeJob_mergesContentAndDeletesSecondary() throws Exception {
        Path conceptsDir = vault.resolve("wiki/concepts");
        Files.createDirectories(conceptsDir);

        Files.writeString(
                conceptsDir.resolve("machine-learning.md"),
                """
                ---
                title: Machine Learning
                ---

                # Machine Learning

                ## Summary
                ML is a subset of AI.

                ## Related
                [[neural-network]]
                """,
                StandardCharsets.UTF_8);

        Files.writeString(
                conceptsDir.resolve("aprendizaje-automatico.md"),
                """
                ---
                title: Aprendizaje Automático
                ---

                # Aprendizaje Automático

                ## Summary
                Rama de la inteligencia artificial.

                ## Historia
                Surgió en los 1950s.
                """,
                StandardCharsets.UTF_8);

        Path topicsDir = vault.resolve("wiki/topics");
        Files.createDirectories(topicsDir);
        Files.writeString(
                topicsDir.resolve("ai.md"),
                "# AI\n\n## Related\n[[aprendizaje-automatico]]\n",
                StandardCharsets.UTF_8);

        ConceptMergeRequest request =
                new ConceptMergeRequest(
                        List.of(
                                new ConceptDedupGroup(
                                        "machine-learning",
                                        List.of("machine-learning", "aprendizaje-automatico"),
                                        0.91)));
        String payloadJson = objectMapper.writeValueAsString(request);

        Job mergeJob = job(UUID.randomUUID(), JobType.MERGE, JobStatus.STARTED);
        mergeJob.setPayloadRef(payloadJson);

        FakeDocumentRepository docRepo = new FakeDocumentRepository();
        mergeJobHandler(docRepo, mergeJob).run(mergeJob);

        assertThat(mergeJob.getStatus()).isEqualTo(JobStatus.COMPLETED);

        Path canonical = conceptsDir.resolve("machine-learning.md");
        assertThat(Files.exists(canonical)).isTrue();
        String canonicalContent = Files.readString(canonical, StandardCharsets.UTF_8);
        assertThat(canonicalContent).contains("ML is a subset of AI");
        assertThat(canonicalContent).contains("## Historia");
        assertThat(canonicalContent).contains("aliases:");
        assertThat(canonicalContent).contains("aprendizaje-automatico");

        assertThat(Files.exists(conceptsDir.resolve("aprendizaje-automatico.md"))).isFalse();

        String aiContent = Files.readString(topicsDir.resolve("ai.md"), StandardCharsets.UTF_8);
        assertThat(aiContent).contains("[[machine-learning]]");
        assertThat(aiContent).doesNotContain("[[aprendizaje-automatico]]");
    }

    @Test
    void mergeJob_isRevertibleViaJobRevertService() throws Exception {
        Path conceptsDir = vault.resolve("wiki/concepts");
        Files.createDirectories(conceptsDir);

        Files.writeString(
                conceptsDir.resolve("machine-learning.md"),
                "# Machine Learning\n\n## Summary\nML content.\n",
                StandardCharsets.UTF_8);
        Files.writeString(
                conceptsDir.resolve("ml.md"),
                "# ML\n\n## Summary\nAlias content.\n",
                StandardCharsets.UTF_8);

        ConceptMergeRequest request =
                new ConceptMergeRequest(
                        List.of(
                                new ConceptDedupGroup(
                                        "machine-learning",
                                        List.of("machine-learning", "ml"),
                                        0.95)));
        String payloadJson = objectMapper.writeValueAsString(request);

        Job mergeJob = job(UUID.randomUUID(), JobType.MERGE, JobStatus.STARTED);
        mergeJob.setPayloadRef(payloadJson);
        ReflectionTestUtils.setField(mergeJob, "createdAt", Instant.parse("2026-07-01T00:00:00Z"));

        FakeDocumentRepository docRepo = new FakeDocumentRepository();
        mergeJobHandler(docRepo, mergeJob).run(mergeJob);
        assertThat(mergeJob.getStatus()).isEqualTo(JobStatus.COMPLETED);
        assertThat(Files.exists(conceptsDir.resolve("ml.md"))).isFalse();

        Job revertJob = job(UUID.randomUUID(), JobType.REVERT, JobStatus.STARTED);
        revertJob.setPayloadRef(mergeJob.getId().toString());

        revertService(mergeJob, revertJob, docRepo).revert(revertJob);

        assertThat(mergeJob.getStatus()).isEqualTo(JobStatus.REVERTED);
        assertThat(revertJob.getStatus()).isEqualTo(JobStatus.COMPLETED);
        assertThat(Files.exists(conceptsDir.resolve("ml.md"))).isTrue();
    }

    @Test
    void mergeJob_backlinksInCodeBlockNotReplaced() throws Exception {
        Path conceptsDir = vault.resolve("wiki/concepts");
        Files.createDirectories(conceptsDir);
        Files.writeString(
                conceptsDir.resolve("machine-learning.md"),
                "# Machine Learning\n\n## Summary\nML.\n",
                StandardCharsets.UTF_8);
        Files.writeString(
                conceptsDir.resolve("ml.md"),
                "# ML\n\n## Summary\nShort.\n",
                StandardCharsets.UTF_8);

        Path topicsDir = vault.resolve("wiki/topics");
        Files.createDirectories(topicsDir);
        Files.writeString(
                topicsDir.resolve("ai.md"),
                "# AI\n\nText [[ml]].\n\n```\nDo not replace [[ml]] here.\n```\n",
                StandardCharsets.UTF_8);

        ConceptMergeRequest request =
                new ConceptMergeRequest(
                        List.of(
                                new ConceptDedupGroup(
                                        "machine-learning",
                                        List.of("machine-learning", "ml"),
                                        0.93)));
        Job mergeJob = job(UUID.randomUUID(), JobType.MERGE, JobStatus.STARTED);
        mergeJob.setPayloadRef(objectMapper.writeValueAsString(request));

        mergeJobHandler(new FakeDocumentRepository(), mergeJob).run(mergeJob);

        String aiContent = Files.readString(topicsDir.resolve("ai.md"), StandardCharsets.UTF_8);
        assertThat(aiContent).contains("Text [[machine-learning]]");
        assertThat(aiContent).contains("Do not replace [[ml]] here.");
    }

    private ConceptMergeJobHandler mergeJobHandler(DocumentIndexRepository docRepo) {
        return mergeJobHandler(docRepo, null);
    }

    private ConceptMergeJobHandler mergeJobHandler(DocumentIndexRepository docRepo, Job jobRef) {
        MarkdownService markdownService = new MarkdownService();
        VaultPathResolver pathResolver = resolver();
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));
        when(jobRepository.findById(any(UUID.class)))
                .thenAnswer(
                        inv -> {
                            if (jobRef != null && inv.getArgument(0).equals(jobRef.getId())) {
                                return Optional.of(jobRef);
                            }
                            return Optional.empty();
                        });
        JobLifecycleService lifecycleService =
                new JobLifecycleService(jobRepository, mock(JobEventService.class), objectMapper);
        ReindexService reindexService = new ReindexService(pathResolver, markdownService, docRepo);
        EmbeddingIndexService embeddingIndexService =
                new EmbeddingIndexService(
                        docRepo, new StubEmbeddingClient(), properties(), markdownService);
        return new ConceptMergeJobHandler(
                markdownService,
                pathResolver,
                snapshotService,
                reindexService,
                embeddingIndexService,
                lifecycleService,
                jobRepository,
                objectMapper);
    }

    private JobRevertService revertService(
            Job target, Job revertJob, DocumentIndexRepository docRepo) {
        MarkdownService markdownService = new MarkdownService();
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.findById(target.getId())).thenReturn(Optional.of(target));
        when(jobRepository.findById(revertJob.getId())).thenReturn(Optional.of(revertJob));
        when(jobRepository.findByCreatedAtAfterOrderByCreatedAtAsc(any())).thenReturn(List.of());
        when(jobRepository.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));
        OperationRepository operationRepository = mock(OperationRepository.class);
        when(operationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        JobLifecycleService lifecycleService =
                new JobLifecycleService(jobRepository, mock(JobEventService.class), objectMapper);
        return new JobRevertService(
                jobRepository,
                operationRepository,
                snapshotService,
                new ReindexService(resolver(), markdownService, docRepo),
                new EmbeddingIndexService(
                        docRepo, new StubEmbeddingClient(), properties(), markdownService),
                lifecycleService,
                objectMapper);
    }

    private Job job(UUID id, JobType type, JobStatus status) {
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", id);
        job.setType(type);
        job.setMode(JobMode.unattended);
        job.transitionTo(status);
        return job;
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(properties());
    }

    private AppProperties properties() {
        return new AppProperties(
                vault.toString(),
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings(
                        "http://embeddings:8080", "test-model", "", 2, Duration.ofSeconds(1), 1),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                null,
                null,
                null,
                null,
                null);
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
    }
}
