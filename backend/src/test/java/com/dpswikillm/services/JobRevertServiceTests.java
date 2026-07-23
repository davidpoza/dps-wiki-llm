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
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.repositories.DocumentIndexRepository;
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

class JobRevertServiceTests {
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
    void cleanRevertViaSnapshotReindexes() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(
                vault.resolve("wiki/concepts/revert-me.md"),
                "# Revert Me\n",
                StandardCharsets.UTF_8);

        Snapshot originalSnapshot =
                snapshotService.beginSnapshot("target", "ingest", "Create note");
        snapshotService.captureFile(originalSnapshot, "wiki/concepts/revert-me.md");
        Files.delete(vault.resolve("wiki/concepts/revert-me.md"));
        snapshotService.recordAfter(originalSnapshot, "wiki/concepts/revert-me.md");

        Job target = job(UUID.randomUUID(), JobType.INGEST, JobStatus.COMPLETED);
        ReflectionTestUtils.setField(target, "createdAt", Instant.parse("2026-07-08T00:00:00Z"));
        target.setAffectedPaths("[\"wiki/concepts/revert-me.md\"]");
        target.setSnapshotId(originalSnapshot.getId());
        snapshotService.finalizeSnapshot(originalSnapshot, target);

        Job revertJob = job(UUID.randomUUID(), JobType.REVERT, JobStatus.STARTED);
        revertJob.setPayloadRef(target.getId().toString());

        FakeDocumentRepository docRepo = new FakeDocumentRepository();
        service(target, revertJob, List.of(), docRepo).revert(revertJob);

        assertThat(Files.exists(vault.resolve("wiki/concepts/revert-me.md"))).isTrue();
        assertThat(Files.readString(vault.resolve("wiki/concepts/revert-me.md")))
                .isEqualTo("# Revert Me\n");
        assertThat(target.getStatus()).isEqualTo(JobStatus.REVERTED);
        assertThat(revertJob.getSnapshotId()).isNotNull();
    }

    @Test
    void revertIngestJobDeletesRawFile() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(
                vault.resolve("raw/inbox/source.md"), "# Source\n", StandardCharsets.UTF_8);
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(
                vault.resolve("wiki/concepts/note.md"), "# Note\n", StandardCharsets.UTF_8);

        Snapshot originalSnapshot =
                snapshotService.beginSnapshot("target", "ingest", "Ingest note");
        snapshotService.captureFileAsNew(originalSnapshot, "raw/inbox/source.md");
        snapshotService.recordAfter(originalSnapshot, "raw/inbox/source.md");
        snapshotService.captureFile(originalSnapshot, "wiki/concepts/note.md");
        Files.delete(vault.resolve("wiki/concepts/note.md"));
        snapshotService.recordAfter(originalSnapshot, "wiki/concepts/note.md");

        Job target = job(UUID.randomUUID(), JobType.INGEST, JobStatus.COMPLETED);
        ReflectionTestUtils.setField(target, "createdAt", Instant.parse("2026-07-08T00:00:00Z"));
        target.setAffectedPaths("[\"wiki/concepts/note.md\",\"raw/inbox/source.md\"]");
        target.setSnapshotId(originalSnapshot.getId());
        snapshotService.finalizeSnapshot(originalSnapshot, target);

        Job revertJob = job(UUID.randomUUID(), JobType.REVERT, JobStatus.STARTED);
        revertJob.setPayloadRef(target.getId().toString());

        service(target, revertJob, List.of(), new FakeDocumentRepository()).revert(revertJob);

        assertThat(Files.exists(vault.resolve("raw/inbox/source.md"))).isFalse();
        assertThat(Files.exists(vault.resolve("wiki/concepts/note.md"))).isTrue();
        assertThat(target.getStatus()).isEqualTo(JobStatus.REVERTED);
    }

    @Test
    void laterJobConflictBlocksRevert() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(
                vault.resolve("wiki/concepts/revert-me.md"),
                "# Revert Me\n",
                StandardCharsets.UTF_8);

        Snapshot originalSnapshot =
                snapshotService.beginSnapshot("target", "ingest", "Create note");
        snapshotService.captureFile(originalSnapshot, "wiki/concepts/revert-me.md");
        snapshotService.recordAfter(originalSnapshot, "wiki/concepts/revert-me.md");

        Job target = job(UUID.randomUUID(), JobType.INGEST, JobStatus.COMPLETED);
        ReflectionTestUtils.setField(target, "createdAt", Instant.parse("2026-07-08T00:00:00Z"));
        target.setAffectedPaths("[\"wiki/concepts/revert-me.md\"]");
        target.setSnapshotId(originalSnapshot.getId());
        snapshotService.finalizeSnapshot(originalSnapshot, target);

        Job later = job(UUID.randomUUID(), JobType.INGEST, JobStatus.COMPLETED);
        later.setAffectedPaths("[\"wiki/concepts/revert-me.md\"]");
        ReflectionTestUtils.setField(later, "createdAt", Instant.parse("2026-07-08T00:01:00Z"));

        Job revertJob = job(UUID.randomUUID(), JobType.REVERT, JobStatus.STARTED);
        revertJob.setPayloadRef(target.getId().toString());

        service(target, revertJob, List.of(later), new FakeDocumentRepository()).revert(revertJob);

        assertThat(target.getStatus()).isEqualTo(JobStatus.COMPLETED);
        assertThat(revertJob.getStatus()).isEqualTo(JobStatus.FAILED);
        assertThat(Files.exists(vault.resolve("wiki/concepts/revert-me.md"))).isTrue();
    }

    private JobRevertService service(
            Job target,
            Job revertJob,
            List<Job> laterJobs,
            DocumentIndexRepository documentRepository) {
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.findById(target.getId())).thenReturn(Optional.of(target));
        when(jobRepository.findById(revertJob.getId())).thenReturn(Optional.of(revertJob));
        when(jobRepository.findByCreatedAtAfterOrderByCreatedAtAsc(any())).thenReturn(laterJobs);
        when(jobRepository.save(any(Job.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        OperationRepository operationRepository = mock(OperationRepository.class);
        when(operationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        JobLifecycleService lifecycleService =
                new JobLifecycleService(
                        jobRepository,
                        mock(JobEventService.class),
                        new com.fasterxml.jackson.databind.ObjectMapper());

        return new JobRevertService(
                jobRepository,
                operationRepository,
                snapshotService,
                new ReindexService(resolver(), new MarkdownService(), documentRepository),
                new EmbeddingIndexService(
                        documentRepository,
                        new StubEmbeddingClient(),
                        properties(),
                        new MarkdownService()),
                lifecycleService,
                new ObjectMapper());
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
    }
}
