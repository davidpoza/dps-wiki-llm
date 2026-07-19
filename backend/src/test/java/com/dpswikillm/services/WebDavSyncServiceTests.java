package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.VaultFileSync;
import com.dpswikillm.dto.ConflictDto;
import com.dpswikillm.dto.SyncResultDto;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.VaultFileSyncRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WebDavSyncServiceTests {

    @TempDir
    Path vault;

    private FakeWebDavClient webdav;
    private Map<String, VaultFileSync> baselineStore;
    private VaultFileSyncRepository baselineRepo;
    private SnapshotService snapshotService;
    private VaultPathResolver resolver;
    private WebDavSyncService service;
    private FileService fileService;

    @BeforeEach
    void setUp() {
        resolver = new VaultPathResolver(props(vault.toString(), "https://dav.example.com/vault"));
        JobRepository jobRepo = mock(JobRepository.class);
        when(jobRepo.save(any(Job.class))).thenAnswer(i -> i.getArgument(0));
        var fakeSnapshotRepo = new SnapshotServiceTests.FakeSnapshotRepository();
        var fakeSnapshotFileRepo = new SnapshotServiceTests.FakeSnapshotFileRepository();
        fakeSnapshotFileRepo.setSnapshotRepo(fakeSnapshotRepo);
        snapshotService = new SnapshotService(fakeSnapshotRepo, fakeSnapshotFileRepo, resolver, jobRepo);
        webdav = new FakeWebDavClient(props(vault.toString(), "https://dav.example.com/vault"));

        baselineStore = new HashMap<>();
        baselineRepo = mock(VaultFileSyncRepository.class);
        when(baselineRepo.findById(anyString())).thenAnswer(i -> Optional.ofNullable(baselineStore.get(i.getArgument(0))));
        when(baselineRepo.save(any())).thenAnswer(i -> {
            VaultFileSync row = i.getArgument(0);
            baselineStore.put(row.getPath(), row);
            return row;
        });
        when(baselineRepo.findAll()).thenAnswer(i -> new ArrayList<>(baselineStore.values()));
        when(baselineRepo.findByConflictTrue()).thenAnswer(i ->
                baselineStore.values().stream().filter(VaultFileSync::isConflict).toList());
        doAnswer(i -> {
            baselineStore.remove(i.getArgument(0));
            return null;
        }).when(baselineRepo).deleteById(anyString());

        service = new WebDavSyncService(webdav, baselineRepo, snapshotService, resolver);
        fileService = new FileService(resolver, snapshotService, service, mock(ResourceSettingsService.class));
    }

    // ---------------- Section 5: push on save/delete/rename ----------------

    @Test
    void saveReplicatesToWebDavAndSetsBaseline() throws Exception {
        Files.createDirectories(vault.resolve("wiki"));
        fileService.saveContent("wiki/note.md", "hello");

        assertThat(webdav.remote).containsEntry("wiki/note.md", "hello");
        assertThat(baselineStore.get("wiki/note.md").isReplicated()).isTrue();
        assertThat(baselineStore.get("wiki/note.md").getSyncedHash())
                .isEqualTo(WebDavSyncService.sha256("hello"));
    }

    @Test
    void saveFailurePropagatesAndKeepsLocalWriteUnreplicated() throws Exception {
        Files.createDirectories(vault.resolve("wiki"));
        webdav.failPut = true;

        assertThatThrownBy(() -> fileService.saveContent("wiki/note.md", "hello"))
                .isInstanceOf(WebDavReplicationException.class);

        assertThat(Files.readString(vault.resolve("wiki/note.md"))).isEqualTo("hello");
        assertThat(baselineStore.get("wiki/note.md").isReplicated()).isFalse();
    }

    @Test
    void deleteReplicatesToWebDav() throws Exception {
        Files.createDirectories(vault.resolve("wiki"));
        Files.writeString(vault.resolve("wiki/note.md"), "x");
        webdav.remote.put("wiki/note.md", "x");
        baselineStore.put("wiki/note.md", baseline("wiki/note.md", WebDavSyncService.sha256("x")));

        fileService.deleteFile("wiki/note.md");

        assertThat(webdav.remote).doesNotContainKey("wiki/note.md");
        assertThat(baselineStore).doesNotContainKey("wiki/note.md");
    }

    @Test
    void renameReplicatesToWebDav() throws Exception {
        Files.createDirectories(vault.resolve("wiki"));
        Files.writeString(vault.resolve("wiki/old.md"), "body");
        webdav.remote.put("wiki/old.md", "body");

        fileService.renameFile("wiki/old.md", "new.md");

        assertThat(webdav.remote).containsKey("wiki/new.md");
        assertThat(webdav.remote).doesNotContainKey("wiki/old.md");
    }

    @Test
    void saveIsNoopWhenWebDavDisabled() throws Exception {
        webdav.enabled = false;
        Files.createDirectories(vault.resolve("wiki"));

        fileService.saveContent("wiki/note.md", "hello");

        assertThat(webdav.remote).isEmpty();
        assertThat(baselineStore).isEmpty();
        assertThat(Files.readString(vault.resolve("wiki/note.md"))).isEqualTo("hello");
    }

    // ---------------- Section 6: sync reconcile branches ----------------

    @Test
    void syncNotConfiguredThrows() {
        webdav.enabled = false;
        assertThatThrownBy(() -> service.sync()).isInstanceOf(WebDavNotConfiguredException.class);
    }

    @Test
    void remoteOnlyChangeIsPulled() throws Exception {
        writeLocal("a.md", "v1");
        baselineStore.put("a.md", baseline("a.md", WebDavSyncService.sha256("v1")));
        webdav.remote.put("a.md", "v2");

        SyncResultDto result = service.sync();

        assertThat(result.pulled()).containsExactly("a.md");
        assertThat(result.conflicts()).isEmpty();
        assertThat(readLocal("a.md")).isEqualTo("v2");
        assertThat(baselineStore.get("a.md").getSyncedHash()).isEqualTo(WebDavSyncService.sha256("v2"));
        assertThat(snapshotService.getFileHistory(0, 50).content())
                .anyMatch(e -> e.path().equals("a.md") && e.source().equals("WEBDAV_PULL"));
    }

    @Test
    void localOnlyChangeIsNotAConflict() throws Exception {
        writeLocal("a.md", "v2");
        baselineStore.put("a.md", baseline("a.md", WebDavSyncService.sha256("v1")));
        webdav.remote.put("a.md", "v1");

        SyncResultDto result = service.sync();

        assertThat(result.pulled()).isEmpty();
        assertThat(result.conflicts()).isEmpty();
        assertThat(readLocal("a.md")).isEqualTo("v2");
    }

    @Test
    void bothChangedIsConflictAndNeitherSideOverwritten() throws Exception {
        writeLocal("a.md", "local-change");
        baselineStore.put("a.md", baseline("a.md", WebDavSyncService.sha256("v0")));
        webdav.remote.put("a.md", "remote-change");

        SyncResultDto result = service.sync();

        assertThat(result.conflicts()).containsExactly("a.md");
        assertThat(readLocal("a.md")).isEqualTo("local-change");
        assertThat(webdav.remote.get("a.md")).isEqualTo("remote-change");
        VaultFileSync row = baselineStore.get("a.md");
        assertThat(row.isConflict()).isTrue();
        assertThat(row.getRemoteContent()).isEqualTo("remote-change");
    }

    @Test
    void remoteDeleteIsPulled() throws Exception {
        writeLocal("a.md", "v1");
        baselineStore.put("a.md", baseline("a.md", WebDavSyncService.sha256("v1")));
        // remote empty

        SyncResultDto result = service.sync();

        assertThat(result.deleted()).containsExactly("a.md");
        assertThat(Files.exists(vault.resolve("a.md"))).isFalse();
        assertThat(baselineStore).doesNotContainKey("a.md");
    }

    @Test
    void newLocalFileIsPushedOnFirstSync() throws Exception {
        writeLocal("a.md", "v1");
        // no baseline, remote empty

        service.sync();

        assertThat(webdav.remote).containsEntry("a.md", "v1");
        assertThat(baselineStore.get("a.md").getSyncedHash()).isEqualTo(WebDavSyncService.sha256("v1"));
    }

    @Test
    void newRemoteFileIsPulledOnFirstSync() throws Exception {
        webdav.remote.put("a.md", "v1");
        // no baseline, no local

        SyncResultDto result = service.sync();

        assertThat(result.pulled()).containsExactly("a.md");
        assertThat(readLocal("a.md")).isEqualTo("v1");
    }

    // ---------------- Conflict listing + resolution ----------------

    @Test
    void resolveKeepLocalPushesLocalAndClearsConflict() throws Exception {
        writeLocal("a.md", "local-change");
        baselineStore.put("a.md", baseline("a.md", WebDavSyncService.sha256("v0")));
        webdav.remote.put("a.md", "remote-change");
        service.sync();

        List<ConflictDto> conflicts = service.listConflicts();
        assertThat(conflicts).hasSize(1);
        assertThat(conflicts.getFirst().localContent()).isEqualTo("local-change");
        assertThat(conflicts.getFirst().remoteContent()).isEqualTo("remote-change");

        service.resolveConflict("a.md", WebDavSyncService.KEEP_LOCAL);

        assertThat(webdav.remote.get("a.md")).isEqualTo("local-change");
        assertThat(readLocal("a.md")).isEqualTo("local-change");
        assertThat(baselineStore.get("a.md").isConflict()).isFalse();
        assertThat(service.listConflicts()).isEmpty();
    }

    @Test
    void resolveKeepRemoteWritesLocalAndRecordsPullHistory() throws Exception {
        writeLocal("a.md", "local-change");
        baselineStore.put("a.md", baseline("a.md", WebDavSyncService.sha256("v0")));
        webdav.remote.put("a.md", "remote-change");
        service.sync();

        service.resolveConflict("a.md", WebDavSyncService.KEEP_REMOTE);

        assertThat(readLocal("a.md")).isEqualTo("remote-change");
        assertThat(baselineStore.get("a.md").isConflict()).isFalse();
        assertThat(baselineStore.get("a.md").getSyncedHash())
                .isEqualTo(WebDavSyncService.sha256("remote-change"));
        assertThat(snapshotService.getFileHistory(0, 50).content())
                .anyMatch(e -> e.path().equals("a.md") && e.source().equals("WEBDAV_PULL"));
    }

    @Test
    void resolveUnknownConflictThrows() {
        assertThatThrownBy(() -> service.resolveConflict("missing.md", WebDavSyncService.KEEP_LOCAL))
                .isInstanceOf(java.util.NoSuchElementException.class);
    }

    // ---------------- helpers ----------------

    private void writeLocal(String rel, String content) throws IOException {
        Path p = vault.resolve(rel);
        Files.createDirectories(p.getParent() == null ? vault : p.getParent());
        Files.writeString(p, content, StandardCharsets.UTF_8);
    }

    private String readLocal(String rel) throws IOException {
        return Files.readString(vault.resolve(rel), StandardCharsets.UTF_8);
    }

    private static VaultFileSync baseline(String path, String syncedHash) {
        VaultFileSync row = new VaultFileSync();
        row.setPath(path);
        row.setSyncedHash(syncedHash);
        row.setReplicated(true);
        row.setConflict(false);
        return row;
    }

    private static AppProperties props(String vaultPath, String webdavUrl) {
        return new AppProperties(
                vaultPath, List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "m", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://llm", "m", ""),
                new AppProperties.Telegram("", ""), null, null, null,
                new AppProperties.WebDav(webdavUrl, "user", "pass"));
    }

    /** In-memory WebDAV double keyed by vault-relative path. */
    static class FakeWebDavClient extends WebDavClient {
        final Map<String, String> remote = new HashMap<>();
        boolean enabled = true;
        boolean failPut = false;

        FakeWebDavClient(AppProperties props) {
            super(props);
        }

        @Override
        public boolean isEnabled() {
            return enabled;
        }

        @Override
        public void put(String relPath, String content) throws IOException {
            if (!enabled) {
                return;
            }
            if (failPut) {
                throw new IOException("simulated WebDAV failure");
            }
            remote.put(relPath, content);
        }

        @Override
        public Optional<String> get(String relPath) {
            return enabled ? Optional.ofNullable(remote.get(relPath)) : Optional.empty();
        }

        @Override
        public void delete(String relPath) {
            if (enabled) {
                remote.remove(relPath);
            }
        }

        @Override
        public void move(String fromRel, String toRel) {
            if (enabled && remote.containsKey(fromRel)) {
                remote.put(toRel, remote.remove(fromRel));
            }
        }

        @Override
        public List<RemoteEntry> list() {
            if (!enabled) {
                return List.of();
            }
            return remote.entrySet().stream()
                    .map(e -> new RemoteEntry(e.getKey(), WebDavSyncService.sha256(e.getValue()), null))
                    .toList();
        }
    }
}
