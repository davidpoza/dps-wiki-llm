package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.config.GitProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.OperationCommitRequest;
import com.dpswikillm.domain.SearchResult;
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
    @TempDir
    Path vault;

    @BeforeEach
    void initGit() throws Exception {
        git("init");
        git("config", "user.name", "Test User");
        git("config", "user.email", "test@example.local");
        Files.writeString(vault.resolve("README.md"), "initial\n", StandardCharsets.UTF_8);
        git("add", "README.md");
        git("commit", "-m", "initial");
    }

    @Test
    void cleanRevertCreatesAuditableInverseCommitAndReindexes() throws Exception {
        GitService gitService = gitService();
        String preHead = gitService.getHead().orElseThrow();
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(vault.resolve("wiki/concepts/revert-me.md"), "# Revert Me\n", StandardCharsets.UTF_8);
        var originalCommit = gitService.commitOperation(new OperationCommitRequest(
                "ingest-baseline",
                "target",
                "Create note",
                List.of("wiki/concepts/revert-me.md"),
                Map.of()));

        Job target = job(UUID.randomUUID(), JobType.INGEST, JobStatus.COMPLETED);
        target.setPreGitSha(preHead);
        target.setCommitRange(originalCommit.commitRange());
        target.setAffectedPaths("[\"wiki/concepts/revert-me.md\"]");
        ReflectionTestUtils.setField(target, "createdAt", Instant.parse("2026-07-08T00:00:00Z"));
        Job revertJob = job(UUID.randomUUID(), JobType.REVERT, JobStatus.STARTED);
        revertJob.setPayloadRef(target.getId().toString());

        FakeRepository documentRepository = new FakeRepository();
        service(target, revertJob, List.of(), documentRepository, gitService).revert(revertJob);

        assertThat(Files.exists(vault.resolve("wiki/concepts/revert-me.md"))).isFalse();
        assertThat(documentRepository.documents).isEmpty();
        assertThat(target.getStatus()).isEqualTo(JobStatus.REVERTED);
        assertThat(revertJob.getCommitRange()).isNotBlank();
        assertThat(revertJob.getAffectedPaths()).contains("wiki/concepts/revert-me.md", "state/change-log/");
        assertThat(gitService.getHead().orElseThrow()).isNotEqualTo(originalCommit.commitSha());
        assertThat(git("status", "--short")).isBlank();
    }

    @Test
    void laterJobTouchingSamePathBlocksRevertBeforeGitChanges() throws Exception {
        GitService gitService = gitService();
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(vault.resolve("wiki/concepts/revert-me.md"), "# Revert Me\n", StandardCharsets.UTF_8);
        var originalCommit = gitService.commitOperation(new OperationCommitRequest(
                "ingest-baseline",
                "target",
                "Create note",
                List.of("wiki/concepts/revert-me.md"),
                Map.of()));
        String headBeforeRevert = gitService.getHead().orElseThrow();

        Job target = job(UUID.randomUUID(), JobType.INGEST, JobStatus.COMPLETED);
        target.setCommitRange(originalCommit.commitRange());
        target.setAffectedPaths("[\"wiki/concepts/revert-me.md\"]");
        ReflectionTestUtils.setField(target, "createdAt", Instant.parse("2026-07-08T00:00:00Z"));
        Job later = job(UUID.randomUUID(), JobType.INGEST, JobStatus.COMPLETED);
        later.setAffectedPaths("[\"wiki/concepts/revert-me.md\"]");
        ReflectionTestUtils.setField(later, "createdAt", Instant.parse("2026-07-08T00:01:00Z"));
        Job revertJob = job(UUID.randomUUID(), JobType.REVERT, JobStatus.STARTED);
        revertJob.setPayloadRef(target.getId().toString());

        service(target, revertJob, List.of(later), new FakeRepository(), gitService).revert(revertJob);

        assertThat(target.getStatus()).isEqualTo(JobStatus.COMPLETED);
        assertThat(revertJob.getStatus()).isEqualTo(JobStatus.FAILED);
        assertThat(gitService.getHead()).contains(headBeforeRevert);
        assertThat(Files.exists(vault.resolve("wiki/concepts/revert-me.md"))).isTrue();
    }

    private JobRevertService service(Job target, Job revertJob, List<Job> laterJobs,
                                     FakeRepository documentRepository, GitService gitService) {
        JobRepository jobRepository = mock(JobRepository.class);
        when(jobRepository.findById(target.getId())).thenReturn(Optional.of(target));
        when(jobRepository.findById(revertJob.getId())).thenReturn(Optional.of(revertJob));
        when(jobRepository.findByCreatedAtAfterOrderByCreatedAtAsc(any())).thenReturn(laterJobs);
        when(jobRepository.save(any(Job.class))).thenAnswer(invocation -> invocation.getArgument(0));
        OperationRepository operationRepository = mock(OperationRepository.class);
        when(operationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        JobLifecycleService lifecycleService = new JobLifecycleService(jobRepository, mock(JobEventService.class));

        JobRevertService service = new JobRevertService(
                jobRepository,
                operationRepository,
                gitService,
                new ReindexService(resolver(), new MarkdownService(), documentRepository),
                new EmbeddingIndexService(documentRepository, new StubEmbeddingClient(), properties()),
                lifecycleService,
                new ObjectMapper());
        if (laterJobs.isEmpty()) {
            verify(operationRepository, org.mockito.Mockito.never()).save(any());
        }
        return service;
    }

    private Job job(UUID id, JobType type, JobStatus status) {
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", id);
        job.setType(type);
        job.setMode(JobMode.unattended);
        job.transitionTo(status);
        return job;
    }

    private GitService gitService() {
        return new GitService(resolver(), new GitProperties("Test User", "test@example.local"));
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

    private static class FakeRepository implements DocumentIndexRepository {
        List<DocumentRecord> documents = new ArrayList<>();
        Map<UUID, String> hashes = new LinkedHashMap<>();

        @Override
        public void replaceDocuments(List<DocumentRecord> documents) {
            this.documents = new ArrayList<>(documents);
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
}
