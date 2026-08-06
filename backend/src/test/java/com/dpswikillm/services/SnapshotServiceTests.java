package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.domain.SnapshotFile;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.SnapshotFileRepository;
import com.dpswikillm.repositories.SnapshotRepository;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

class SnapshotServiceTests {
    @TempDir Path vault;

    private FakeSnapshotRepository snapshotRepo;
    private FakeSnapshotFileRepository snapshotFileRepo;
    private SnapshotService snapshotService;

    @BeforeEach
    void setUp() {
        snapshotRepo = new FakeSnapshotRepository();
        snapshotFileRepo = new FakeSnapshotFileRepository();
        snapshotFileRepo.setSnapshotRepo(snapshotRepo);
        JobRepository jobRepo = mock(JobRepository.class);
        when(jobRepo.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));
        snapshotService = new SnapshotService(snapshotRepo, snapshotFileRepo, resolver(), jobRepo);
    }

    @Test
    void captureAndRevertRestoresOriginalContent() throws Exception {
        Files.createDirectories(vault.resolve("wiki/sources"));
        Files.writeString(
                vault.resolve("wiki/sources/note.md"),
                "original content\n",
                StandardCharsets.UTF_8);

        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.captureFile(snapshot, "wiki/sources/note.md");

        Files.writeString(
                vault.resolve("wiki/sources/note.md"),
                "modified content\n",
                StandardCharsets.UTF_8);
        snapshotService.recordAfter(snapshot, "wiki/sources/note.md");
        snapshotService.finalizeSnapshot(snapshot, null);

        snapshotService.hardReset(snapshot.getId());

        assertThat(Files.readString(vault.resolve("wiki/sources/note.md")))
                .isEqualTo("original content\n");
    }

    @Test
    void captureNewFileHasNullContentBefore() throws Exception {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.captureFile(snapshot, "wiki/sources/new.md");

        SnapshotFile sf =
                snapshotFileRepo
                        .findBySnapshotIdAndPath(snapshot.getId(), "wiki/sources/new.md")
                        .orElseThrow();
        assertThat(sf.getContentBefore()).isNull();
    }

    @Test
    void revertNewFileCausesFileDeletion() throws Exception {
        Files.createDirectories(vault.resolve("wiki/sources"));
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.captureFile(snapshot, "wiki/sources/new.md");
        Files.writeString(
                vault.resolve("wiki/sources/new.md"), "new content\n", StandardCharsets.UTF_8);
        snapshotService.recordAfter(snapshot, "wiki/sources/new.md");
        snapshotService.finalizeSnapshot(snapshot, null);

        snapshotService.hardReset(snapshot.getId());

        assertThat(Files.exists(vault.resolve("wiki/sources/new.md"))).isFalse();
    }

    @Test
    void getDiffReturnsUnifiedDiff() throws Exception {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        SnapshotFile sf = new SnapshotFile();
        ReflectionTestUtils.setField(sf, "id", UUID.randomUUID());
        sf.setSnapshotId(snapshot.getId());
        sf.setPath("wiki/sources/note.md");
        sf.setContentBefore("line one\nline two\n");
        sf.setContentAfter("line one\nline three\n");
        snapshotFileRepo.save(sf);
        snapshotService.finalizeSnapshot(snapshot, null);

        String diff = snapshotService.getDiffByChangeId(sf.getId());

        assertThat(diff).contains("-line two");
        assertThat(diff).contains("+line three");
    }

    @Test
    void getDiffThrowsForUnknownChange() {
        assertThatThrownBy(() -> snapshotService.getDiffByChangeId(UUID.randomUUID()))
                .isInstanceOf(java.util.NoSuchElementException.class);
    }

    @Test
    void getDiffNoSpuriousBlankLineFromTrailingNewline() {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        SnapshotFile sf = new SnapshotFile();
        ReflectionTestUtils.setField(sf, "id", UUID.randomUUID());
        sf.setSnapshotId(snapshot.getId());
        sf.setPath("wiki/sources/note.md");
        sf.setContentBefore("line one\nline two\n");
        sf.setContentAfter("line one\nline three\n");
        snapshotFileRepo.save(sf);

        String diff = snapshotService.getDiffByChangeId(sf.getId());

        assertThat(diff).doesNotContain("\n\n\n");
        assertThat(diff.lines().filter(String::isBlank).count()).isLessThan(2);
    }

    @Test
    void getDiffCrlfAndLfIdenticalContentProducesNoDiff() {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        SnapshotFile sf = new SnapshotFile();
        ReflectionTestUtils.setField(sf, "id", UUID.randomUUID());
        sf.setSnapshotId(snapshot.getId());
        sf.setPath("wiki/sources/note.md");
        sf.setContentBefore("line one\r\nline two\r\n");
        sf.setContentAfter("line one\nline two\n");
        snapshotFileRepo.save(sf);

        String diff = snapshotService.getDiffByChangeId(sf.getId());

        assertThat(diff).isEmpty();
    }

    @Test
    void diffStatsDoNotCountTrailingNewlineAsChange() throws Exception {
        Files.createDirectories(vault.resolve("wiki/sources"));
        Files.writeString(
                vault.resolve("wiki/sources/note.md"), "line one\n", StandardCharsets.UTF_8);

        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.captureFile(snapshot, "wiki/sources/note.md");
        Files.writeString(
                vault.resolve("wiki/sources/note.md"),
                "line one\nline two\n",
                StandardCharsets.UTF_8);
        snapshotService.recordAfter(snapshot, "wiki/sources/note.md");
        snapshotService.finalizeSnapshot(snapshot, null);

        var history = snapshotService.getFileHistory(0, 10).content();

        assertThat(history).hasSize(1);
        assertThat(history.getFirst().linesAdded()).isEqualTo(1);
        assertThat(history.getFirst().linesDeleted()).isEqualTo(0);
    }

    @Test
    void captureFileAsNewStoresNullContentBeforeRegardlessOfDiskState() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(
                vault.resolve("raw/inbox/source.md"), "# Source\n", StandardCharsets.UTF_8);

        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.captureFileAsNew(snapshot, "raw/inbox/source.md");

        SnapshotFile sf =
                snapshotFileRepo
                        .findBySnapshotIdAndPath(snapshot.getId(), "raw/inbox/source.md")
                        .orElseThrow();
        assertThat(sf.getContentBefore()).isNull();
    }

    @Test
    void captureFileAsNewAndHardResetDeletesFile() throws Exception {
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(
                vault.resolve("raw/inbox/source.md"), "# Source\n", StandardCharsets.UTF_8);

        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.captureFileAsNew(snapshot, "raw/inbox/source.md");
        snapshotService.recordAfter(snapshot, "raw/inbox/source.md");
        snapshotService.finalizeSnapshot(snapshot, null);

        snapshotService.hardReset(snapshot.getId());

        assertThat(Files.exists(vault.resolve("raw/inbox/source.md"))).isFalse();
    }

    @Test
    void captureFileIsIdempotent() throws Exception {
        Files.createDirectories(vault.resolve("wiki/sources"));
        Files.writeString(
                vault.resolve("wiki/sources/note.md"), "content\n", StandardCharsets.UTF_8);

        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.captureFile(snapshot, "wiki/sources/note.md");
        snapshotService.captureFile(snapshot, "wiki/sources/note.md");

        assertThat(snapshotFileRepo.findBySnapshotId(snapshot.getId())).hasSize(1);
    }

    @Test
    void deleteSnapshotRemovesFilesAndSnapshot() throws Exception {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        SnapshotFile sf = new SnapshotFile();
        ReflectionTestUtils.setField(sf, "id", UUID.randomUUID());
        sf.setSnapshotId(snapshot.getId());
        sf.setPath("some/path.md");
        snapshotFileRepo.save(sf);

        snapshotService.deleteSnapshot(snapshot.getId());

        assertThat(snapshotRepo.findById(snapshot.getId())).isEmpty();
        assertThat(snapshotFileRepo.findBySnapshotId(snapshot.getId())).isEmpty();
    }

    @Test
    void getFileHistoryReturnsFinalizedPerFileEntriesOnly() {
        Snapshot pending = snapshotService.beginSnapshot("j1", "ingest", "pending");
        savedFile(pending, "wiki/pending.md", null, "pending body\n");

        Snapshot complete =
                snapshotService.beginSnapshot(null, "manual-save", "note.md", "LOCAL_EDIT");
        savedFile(complete, "wiki/note.md", null, "hello world");
        snapshotService.finalizeSnapshot(complete, null);

        var history = snapshotService.getFileHistory(0, 50).content();

        assertThat(history).hasSize(1);
        assertThat(history.getFirst().path()).isEqualTo("wiki/note.md");
        assertThat(history.getFirst().source()).isEqualTo("LOCAL_EDIT");
        assertThat(history.getFirst().linesAdded()).isEqualTo(1);
    }

    @Test
    void getFileHistoryOmitsNoOpEntries() {
        Snapshot complete = snapshotService.beginSnapshot("j2", "ingest", "noop");
        savedFile(complete, "wiki/same.md", "identical\n", "identical\n");
        snapshotService.finalizeSnapshot(complete, null);

        assertThat(snapshotService.getFileHistory(0, 50).content()).isEmpty();
    }

    @Test
    void getVersionsReturnsNewestFirstAndContentIsRetrievable() {
        Snapshot older =
                snapshotService.beginSnapshot(null, "manual-save", "note.md", "LOCAL_EDIT");
        SnapshotFile v1 = savedFile(older, "wiki/note.md", null, "v1\n");
        snapshotService.finalizeSnapshot(older, null);

        Snapshot newer =
                snapshotService.beginSnapshot(null, "manual-save", "note.md", "LOCAL_EDIT");
        SnapshotFile v2 = savedFile(newer, "wiki/note.md", "v1\n", "v2\n");
        // ensure a later timestamp than v1
        ReflectionTestUtils.setField(newer, "createdAt", older.getCreatedAt().plusSeconds(5));
        snapshotService.finalizeSnapshot(newer, null);

        List<com.dpswikillm.dto.FileVersionDto> versions =
                snapshotService.getVersions("wiki/note.md");

        assertThat(versions).hasSize(2);
        assertThat(versions.getFirst().versionId()).isEqualTo(v2.getId());
        assertThat(snapshotService.getVersionContent("wiki/note.md", v2.getId())).isEqualTo("v2\n");
        assertThat(snapshotService.getVersionContent("wiki/note.md", v1.getId())).isEqualTo("v1\n");
    }

    @Test
    void findDeletedContentReturnsContentBeforeForDeletion() {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        savedFile(snapshot, "wiki/gone.md", "deleted body\n", null);
        snapshotService.finalizeSnapshot(snapshot, null);

        assertThat(snapshotService.findDeletedContent(snapshot.getId(), "wiki/gone.md"))
                .isEqualTo("deleted body\n");
    }

    @Test
    void findDeletedContentThrowsWhenPathNotInSnapshot() {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        snapshotService.finalizeSnapshot(snapshot, null);

        assertThatThrownBy(
                        () ->
                                snapshotService.findDeletedContent(
                                        snapshot.getId(), "wiki/missing.md"))
                .isInstanceOf(java.util.NoSuchElementException.class);
    }

    @Test
    void findDeletedContentThrowsWhenEntryIsNotADeletion() {
        Snapshot snapshot = snapshotService.beginSnapshot("job-1", "ingest", "test");
        savedFile(snapshot, "wiki/updated.md", "before\n", "after\n");
        snapshotService.finalizeSnapshot(snapshot, null);

        assertThatThrownBy(
                        () ->
                                snapshotService.findDeletedContent(
                                        snapshot.getId(), "wiki/updated.md"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void getVersionContentThrowsForUnknownVersion() {
        assertThatThrownBy(
                        () -> snapshotService.getVersionContent("wiki/note.md", UUID.randomUUID()))
                .isInstanceOf(java.util.NoSuchElementException.class);
    }

    private SnapshotFile savedFile(Snapshot snapshot, String path, String before, String after) {
        SnapshotFile sf = new SnapshotFile();
        ReflectionTestUtils.setField(sf, "id", UUID.randomUUID());
        sf.setSnapshotId(snapshot.getId());
        sf.setPath(path);
        sf.setContentBefore(before);
        sf.setContentAfter(after);
        List<String> beforeLines =
                before != null
                        ? java.util.Arrays.asList(
                                before.replace("\r\n", "\n").replace("\r", "\n").split("\n", 0))
                        : List.of();
        List<String> afterLines =
                after != null
                        ? java.util.Arrays.asList(
                                after.replace("\r\n", "\n").replace("\r", "\n").split("\n", 0))
                        : List.of();
        var patch = com.github.difflib.DiffUtils.diff(beforeLines, afterLines);
        int added = 0, deleted = 0;
        for (var delta : patch.getDeltas()) {
            added += delta.getTarget().size();
            deleted += delta.getSource().size();
        }
        sf.setLinesAdded(added);
        sf.setLinesDeleted(deleted);
        return snapshotFileRepo.save(sf);
    }

    private VaultPathResolver resolver() {
        AppProperties props =
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
                        null);
        return new VaultPathResolver(props);
    }

    // --- In-memory fake repositories ---

    static class FakeSnapshotRepository implements SnapshotRepository {
        private final Map<UUID, Snapshot> store = new LinkedHashMap<>();

        @Override
        public <S extends Snapshot> S save(S entity) {
            if (entity.getId() == null)
                ReflectionTestUtils.setField(entity, "id", UUID.randomUUID());
            store.put(entity.getId(), entity);
            return entity;
        }

        @Override
        public Optional<Snapshot> findById(UUID id) {
            return Optional.ofNullable(store.get(id));
        }

        @Override
        public void deleteById(UUID id) {
            store.remove(id);
        }

        @Override
        public List<Snapshot> findByStatusOrderByCreatedAtDesc(
                String status, org.springframework.data.domain.Pageable p) {
            return store.values().stream()
                    .filter(s -> status.equals(s.getStatus()))
                    .sorted(java.util.Comparator.comparing(Snapshot::getCreatedAt).reversed())
                    .limit(p.isPaged() ? p.getPageSize() : Long.MAX_VALUE)
                    .toList();
        }

        // --- unused JPA methods ---
        @Override
        public boolean existsById(UUID id) {
            return store.containsKey(id);
        }

        @Override
        public List<Snapshot> findAll() {
            return List.copyOf(store.values());
        }

        @Override
        public List<Snapshot> findAllById(Iterable<UUID> ids) {
            return List.of();
        }

        @Override
        public long count() {
            return store.size();
        }

        @Override
        public void delete(Snapshot entity) {
            store.remove(entity.getId());
        }

        @Override
        public void deleteAllById(Iterable<? extends UUID> ids) {
            ids.forEach(store::remove);
        }

        @Override
        public void deleteAll(Iterable<? extends Snapshot> entities) {}

        @Override
        public void deleteAll() {
            store.clear();
        }

        @Override
        public <S extends Snapshot> List<S> saveAll(Iterable<S> entities) {
            entities.forEach(this::save);
            return List.of();
        }

        @Override
        public void flush() {}

        @Override
        public <S extends Snapshot> S saveAndFlush(S entity) {
            return save(entity);
        }

        @Override
        public <S extends Snapshot> List<S> saveAllAndFlush(Iterable<S> entities) {
            return saveAll(entities);
        }

        @Override
        public void deleteAllInBatch(Iterable<Snapshot> entities) {}

        @Override
        public void deleteAllByIdInBatch(Iterable<UUID> ids) {}

        @Override
        public void deleteAllInBatch() {}

        @Override
        public Snapshot getOne(UUID id) {
            return store.get(id);
        }

        @Override
        public Snapshot getById(UUID id) {
            return store.get(id);
        }

        @Override
        public Snapshot getReferenceById(UUID id) {
            return store.get(id);
        }

        @Override
        public <S extends Snapshot> Optional<S> findOne(
                org.springframework.data.domain.Example<S> example) {
            return Optional.empty();
        }

        @Override
        public <S extends Snapshot> List<S> findAll(
                org.springframework.data.domain.Example<S> example) {
            return List.of();
        }

        @Override
        public <S extends Snapshot> List<S> findAll(
                org.springframework.data.domain.Example<S> example,
                org.springframework.data.domain.Sort sort) {
            return List.of();
        }

        @Override
        public <S extends Snapshot> org.springframework.data.domain.Page<S> findAll(
                org.springframework.data.domain.Example<S> example,
                org.springframework.data.domain.Pageable pageable) {
            return org.springframework.data.domain.Page.empty();
        }

        @Override
        public <S extends Snapshot> long count(org.springframework.data.domain.Example<S> example) {
            return 0;
        }

        @Override
        public <S extends Snapshot> boolean exists(
                org.springframework.data.domain.Example<S> example) {
            return false;
        }

        @Override
        public <S extends Snapshot, R> R findBy(
                org.springframework.data.domain.Example<S> example,
                java.util.function.Function<
                                org.springframework.data.repository.query.FluentQuery
                                                .FetchableFluentQuery<
                                        S>,
                                R>
                        queryFunction) {
            return null;
        }

        @Override
        public List<Snapshot> findAll(org.springframework.data.domain.Sort sort) {
            return List.of();
        }

        @Override
        public org.springframework.data.domain.Page<Snapshot> findAll(
                org.springframework.data.domain.Pageable pageable) {
            return org.springframework.data.domain.Page.empty();
        }
    }

    static class FakeSnapshotFileRepository implements SnapshotFileRepository {
        private final Map<UUID, SnapshotFile> store = new LinkedHashMap<>();
        private FakeSnapshotRepository snapshotRepo;

        void setSnapshotRepo(FakeSnapshotRepository snapshotRepo) {
            this.snapshotRepo = snapshotRepo;
        }

        @Override
        public org.springframework.data.domain.Page<com.dpswikillm.dto.FileHistoryEntryDto>
                findHistoryPaged(org.springframework.data.domain.Pageable pageable) {
            List<com.dpswikillm.dto.FileHistoryEntryDto> all =
                    store.values().stream()
                            .filter(
                                    sf ->
                                            sf.getLinesAdded() == null
                                                    || sf.getLinesAdded() > 0
                                                    || sf.getLinesDeleted() > 0)
                            .filter(
                                    sf -> {
                                        if (snapshotRepo == null) return true;
                                        return snapshotRepo
                                                .findById(sf.getSnapshotId())
                                                .map(s -> "COMPLETE".equals(s.getStatus()))
                                                .orElse(false);
                                    })
                            .map(
                                    sf -> {
                                        com.dpswikillm.domain.Snapshot s =
                                                snapshotRepo == null
                                                        ? null
                                                        : snapshotRepo
                                                                .findById(sf.getSnapshotId())
                                                                .orElse(null);
                                        return new com.dpswikillm.dto.FileHistoryEntryDto(
                                                sf.getId(),
                                                sf.getPath(),
                                                s != null ? s.getSource() : "UNKNOWN",
                                                sf.getLinesAdded() != null ? sf.getLinesAdded() : 0,
                                                sf.getLinesDeleted() != null
                                                        ? sf.getLinesDeleted()
                                                        : 0,
                                                s != null ? s.getCreatedAt().toString() : "");
                                    })
                            .sorted(
                                    java.util.Comparator.comparing(
                                                    com.dpswikillm.dto.FileHistoryEntryDto
                                                            ::createdAt)
                                            .reversed())
                            .toList();
            int from = (int) pageable.getOffset();
            int to = Math.min(from + pageable.getPageSize(), all.size());
            List<com.dpswikillm.dto.FileHistoryEntryDto> content =
                    from > all.size() ? List.of() : all.subList(from, to);
            return new org.springframework.data.domain.PageImpl<>(content, pageable, all.size());
        }

        @Override
        public <S extends SnapshotFile> S save(S entity) {
            if (entity.getId() == null)
                ReflectionTestUtils.setField(entity, "id", UUID.randomUUID());
            store.put(entity.getId(), entity);
            return entity;
        }

        @Override
        public List<SnapshotFile> findBySnapshotId(UUID snapshotId) {
            return store.values().stream()
                    .filter(f -> snapshotId.equals(f.getSnapshotId()))
                    .toList();
        }

        @Override
        public Optional<SnapshotFile> findBySnapshotIdAndPath(UUID snapshotId, String path) {
            return store.values().stream()
                    .filter(f -> snapshotId.equals(f.getSnapshotId()) && path.equals(f.getPath()))
                    .findFirst();
        }

        @Override
        public List<SnapshotFile> findByPath(String path) {
            return store.values().stream().filter(f -> path.equals(f.getPath())).toList();
        }

        @Override
        public void deleteBySnapshotId(UUID snapshotId) {
            store.values().removeIf(f -> snapshotId.equals(f.getSnapshotId()));
        }

        @Override
        public Optional<SnapshotFile> findById(UUID id) {
            return Optional.ofNullable(store.get(id));
        }

        @Override
        public boolean existsById(UUID id) {
            return store.containsKey(id);
        }

        @Override
        public List<SnapshotFile> findAll() {
            return List.copyOf(store.values());
        }

        @Override
        public List<SnapshotFile> findAllById(Iterable<UUID> ids) {
            return List.of();
        }

        @Override
        public long count() {
            return store.size();
        }

        @Override
        public void delete(SnapshotFile entity) {
            store.remove(entity.getId());
        }

        @Override
        public void deleteById(UUID id) {
            store.remove(id);
        }

        @Override
        public void deleteAllById(Iterable<? extends UUID> ids) {
            ids.forEach(store::remove);
        }

        @Override
        public void deleteAll(Iterable<? extends SnapshotFile> entities) {}

        @Override
        public void deleteAll() {
            store.clear();
        }

        @Override
        public <S extends SnapshotFile> List<S> saveAll(Iterable<S> entities) {
            entities.forEach(this::save);
            return List.of();
        }

        @Override
        public void flush() {}

        @Override
        public <S extends SnapshotFile> S saveAndFlush(S entity) {
            return save(entity);
        }

        @Override
        public <S extends SnapshotFile> List<S> saveAllAndFlush(Iterable<S> entities) {
            return saveAll(entities);
        }

        @Override
        public void deleteAllInBatch(Iterable<SnapshotFile> entities) {}

        @Override
        public void deleteAllByIdInBatch(Iterable<UUID> ids) {}

        @Override
        public void deleteAllInBatch() {}

        @Override
        public SnapshotFile getOne(UUID id) {
            return store.get(id);
        }

        @Override
        public SnapshotFile getById(UUID id) {
            return store.get(id);
        }

        @Override
        public SnapshotFile getReferenceById(UUID id) {
            return store.get(id);
        }

        @Override
        public <S extends SnapshotFile> Optional<S> findOne(
                org.springframework.data.domain.Example<S> example) {
            return Optional.empty();
        }

        @Override
        public <S extends SnapshotFile> List<S> findAll(
                org.springframework.data.domain.Example<S> example) {
            return List.of();
        }

        @Override
        public <S extends SnapshotFile> List<S> findAll(
                org.springframework.data.domain.Example<S> example,
                org.springframework.data.domain.Sort sort) {
            return List.of();
        }

        @Override
        public <S extends SnapshotFile> org.springframework.data.domain.Page<S> findAll(
                org.springframework.data.domain.Example<S> example,
                org.springframework.data.domain.Pageable pageable) {
            return org.springframework.data.domain.Page.empty();
        }

        @Override
        public <S extends SnapshotFile> long count(
                org.springframework.data.domain.Example<S> example) {
            return 0;
        }

        @Override
        public <S extends SnapshotFile> boolean exists(
                org.springframework.data.domain.Example<S> example) {
            return false;
        }

        @Override
        public <S extends SnapshotFile, R> R findBy(
                org.springframework.data.domain.Example<S> example,
                java.util.function.Function<
                                org.springframework.data.repository.query.FluentQuery
                                                .FetchableFluentQuery<
                                        S>,
                                R>
                        queryFunction) {
            return null;
        }

        @Override
        public List<SnapshotFile> findAll(org.springframework.data.domain.Sort sort) {
            return List.of();
        }

        @Override
        public org.springframework.data.domain.Page<SnapshotFile> findAll(
                org.springframework.data.domain.Pageable pageable) {
            return org.springframework.data.domain.Page.empty();
        }
    }
}
