package com.dpswikillm.services;

import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.domain.VaultFileSync;
import com.dpswikillm.dto.ConflictDto;
import com.dpswikillm.dto.SyncProgressDto;
import com.dpswikillm.dto.SyncResultDto;
import com.dpswikillm.repositories.VaultFileSyncRepository;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/**
 * Owns WebDAV replication: the synchronous per-file push on save (Section 5) and the
 * manual pull + reconcile with conflict handling triggered by the Sync button (Section 6).
 *
 * <p>Conflict detection compares three things per file — the local content hash, the
 * remote content hash, and the last-synced baseline hash ({@link VaultFileSync#getSyncedHash()}).
 */
@Service
public class WebDavSyncService {

    private static final Logger log = LoggerFactory.getLogger(WebDavSyncService.class);

    public static final String KEEP_LOCAL = "LOCAL";
    public static final String KEEP_REMOTE = "REMOTE";

    private final WebDavClient webDavClient;
    private final VaultFileSyncRepository baselineRepository;
    private final SnapshotService snapshotService;
    private final VaultPathResolver pathResolver;

    public WebDavSyncService(WebDavClient webDavClient,
                             VaultFileSyncRepository baselineRepository,
                             SnapshotService snapshotService,
                             VaultPathResolver pathResolver) {
        this.webDavClient = webDavClient;
        this.baselineRepository = baselineRepository;
        this.snapshotService = snapshotService;
        this.pathResolver = pathResolver;
    }

    public boolean isEnabled() {
        return webDavClient.isEnabled();
    }

    // ---------------------------------------------------------------------
    // Startup baseline initialization
    // ---------------------------------------------------------------------

    @EventListener(ApplicationReadyEvent.class)
    public void initializeBaselines() {
        if (!webDavClient.isEnabled()) {
            return;
        }
        Set<String> localPaths = listLocalMarkdown();
        int total = localPaths.size();
        log.info("WebDAV baseline init: scanning {} local files", total);
        int initialized = 0;
        int processed = 0;
        for (String path : localPaths) {
            processed++;
            if (baselineRepository.findById(path).isEmpty()) {
                String content = readLocal(path);
                upsertBaseline(path, sha256(content), null, true, false, null);
                initialized++;
            }
            log.info("WebDAV baseline init: {}/{} — {}", processed, total, path);
        }
        log.info("WebDAV baseline init: done — {} new baselines created, {} already existed",
                initialized, total - initialized);
    }

    // ---------------------------------------------------------------------
    // Section 5 — synchronous per-file push on save / delete / move
    // ---------------------------------------------------------------------

    /** Pushes a single saved file to WebDAV and updates its baseline. No-op when WebDAV is disabled. */
    public void pushSaved(String relPath, String content) {
        if (!webDavClient.isEnabled()) {
            return;
        }
        String normalized = pathResolver.normalizeRelativePath(relPath);
        try {
            webDavClient.put(normalized, content);
            upsertBaseline(normalized, sha256(content), null, true, false, null);
        } catch (IOException e) {
            markNotReplicated(normalized);
            throw new WebDavReplicationException("Failed to replicate " + normalized + " to WebDAV", e);
        }
    }

    /** Replicates a delete to WebDAV and drops the baseline. No-op when WebDAV is disabled. */
    public void pushDeleted(String relPath) {
        if (!webDavClient.isEnabled()) {
            return;
        }
        String normalized = pathResolver.normalizeRelativePath(relPath);
        try {
            webDavClient.delete(normalized);
            baselineRepository.deleteById(normalized);
        } catch (IOException e) {
            throw new WebDavReplicationException("Failed to replicate delete of " + normalized + " to WebDAV", e);
        }
    }

    /** Replicates a rename/move to WebDAV and moves the baseline. No-op when WebDAV is disabled. */
    public void pushMoved(String fromRel, String toRel, String content) {
        if (!webDavClient.isEnabled()) {
            return;
        }
        String from = pathResolver.normalizeRelativePath(fromRel);
        String to = pathResolver.normalizeRelativePath(toRel);
        try {
            webDavClient.move(from, to);
            // Ensure the destination exists remotely even if the source was never pushed.
            webDavClient.put(to, content);
            baselineRepository.deleteById(from);
            upsertBaseline(to, sha256(content), null, true, false, null);
        } catch (IOException e) {
            throw new WebDavReplicationException("Failed to replicate move " + from + " -> " + to + " to WebDAV", e);
        }
    }

    // ---------------------------------------------------------------------
    // Section 6 — pull + reconcile
    // ---------------------------------------------------------------------

    public SyncResultDto sync() {
        return sync(null);
    }

    public SyncResultDto sync(Consumer<SyncProgressDto> onProgress) {
        if (!webDavClient.isEnabled()) {
            throw new WebDavNotConfiguredException();
        }
        List<WebDavClient.RemoteEntry> remoteEntries;
        try {
            remoteEntries = webDavClient.list();
        } catch (IOException e) {
            throw new WebDavReplicationException("Failed to list WebDAV repository", e);
        }
        Map<String, WebDavClient.RemoteEntry> remoteByPath = remoteEntries.stream()
                .collect(Collectors.toMap(WebDavClient.RemoteEntry::path, e -> e, (a, b) -> a));

        Set<String> localPaths = listLocalMarkdown();
        Set<String> allPaths = new TreeSet<>();
        allPaths.addAll(localPaths);
        allPaths.addAll(remoteByPath.keySet());
        allPaths.addAll(baselineRepository.findAll().stream().map(VaultFileSync::getPath).toList());

        List<String> pulled = new ArrayList<>();
        List<String> deleted = new ArrayList<>();
        List<String> conflicts = new ArrayList<>();
        Snapshot pullSnapshot = null;

        int total = allPaths.size();
        int processed = 0;

        for (String path : allPaths) {
            processed++;
            if (onProgress != null) {
                onProgress.accept(new SyncProgressDto(processed, total, path));
            }
            boolean localExists = localPaths.contains(path);
            String localContent = localExists ? readLocal(path) : null;
            String localHash = localContent != null ? sha256(localContent) : null;

            WebDavClient.RemoteEntry remote = remoteByPath.get(path);
            String remoteContent = remote != null ? fetchRemote(path) : null;
            String remoteHash = remoteContent != null ? sha256(remoteContent) : null;

            VaultFileSync baseline = baselineRepository.findById(path).orElse(null);
            String syncedHash = baseline != null ? baseline.getSyncedHash() : null;

            if (Objects.equals(localHash, remoteHash)) {
                // Already identical (or converged independently); refresh the baseline.
                if (localHash == null) {
                    baselineRepository.deleteById(path);
                } else {
                    upsertBaseline(path, localHash, remote != null ? remote.etag() : null, true, false, null);
                }
                continue;
            }

            boolean localChanged = !Objects.equals(localHash, syncedHash);
            boolean remoteChanged = !Objects.equals(remoteHash, syncedHash);

            if (remoteChanged && !localChanged) {
                if (pullSnapshot == null) {
                    pullSnapshot = snapshotService.beginSnapshot(null, "webdav-sync", "WebDAV sync", "WEBDAV_PULL");
                }
                applyRemote(pullSnapshot, path, remoteContent, remote, remoteHash, pulled, deleted);
            } else if (localChanged && !remoteChanged) {
                // Local-only change. If it is a brand-new local file never pushed, push it now.
                if (remote == null && syncedHash == null && localContent != null) {
                    try {
                        webDavClient.put(path, localContent);
                        upsertBaseline(path, localHash, null, true, false, null);
                    } catch (IOException e) {
                        log.warn("Failed to push local-only file {} during sync: {}", path, e.getMessage());
                    }
                }
                // Otherwise it was already pushed on save; nothing to do.
            } else {
                // Both sides changed since the last sync -> conflict; do not overwrite either side.
                upsertConflict(path, remote != null ? remote.etag() : null, remoteContent);
                conflicts.add(path);
            }
        }

        if (pullSnapshot != null) {
            snapshotService.finalizeSnapshot(pullSnapshot, null);
        }
        return new SyncResultDto(pulled, deleted, conflicts);
    }

    private void applyRemote(Snapshot snapshot, String path, String remoteContent,
                             WebDavClient.RemoteEntry remote, String remoteHash,
                             List<String> pulled, List<String> deleted) {
        try {
            snapshotService.captureFile(snapshot, path);
            if (remoteContent != null) {
                writeLocal(path, remoteContent);
                snapshotService.recordAfter(snapshot, path);
                upsertBaseline(path, remoteHash, remote != null ? remote.etag() : null, true, false, null);
                pulled.add(path);
            } else {
                deleteLocal(path);
                snapshotService.recordAfter(snapshot, path);
                baselineRepository.deleteById(path);
                deleted.add(path);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    // ---------------------------------------------------------------------
    // Conflicts
    // ---------------------------------------------------------------------

    public List<ConflictDto> listConflicts() {
        return baselineRepository.findByConflictTrue().stream()
                .map(b -> new ConflictDto(b.getPath(),
                        localExists(b.getPath()) ? readLocal(b.getPath()) : null,
                        b.getRemoteContent()))
                .toList();
    }

    public void resolveConflict(String path, String keep) {
        String normalized = pathResolver.normalizeRelativePath(path);
        VaultFileSync baseline = baselineRepository.findById(normalized)
                .filter(VaultFileSync::isConflict)
                .orElseThrow(() -> new java.util.NoSuchElementException("No conflict for path: " + path));

        if (KEEP_LOCAL.equalsIgnoreCase(keep)) {
            String localContent = localExists(normalized) ? readLocal(normalized) : "";
            try {
                webDavClient.put(normalized, localContent);
            } catch (IOException e) {
                throw new WebDavReplicationException("Failed to push resolved local content for " + normalized, e);
            }
            upsertBaseline(normalized, sha256(localContent), null, true, false, null);
        } else if (KEEP_REMOTE.equalsIgnoreCase(keep)) {
            String remoteContent = baseline.getRemoteContent() == null ? "" : baseline.getRemoteContent();
            Snapshot snapshot = snapshotService.beginSnapshot(null, "webdav-conflict-resolve", normalized, "WEBDAV_PULL");
            try {
                snapshotService.captureFile(snapshot, normalized);
                writeLocal(normalized, remoteContent);
                snapshotService.recordAfter(snapshot, normalized);
            } catch (IOException e) {
                snapshotService.deleteSnapshot(snapshot.getId());
                throw new UncheckedIOException(e);
            }
            snapshotService.finalizeSnapshot(snapshot, null);
            upsertBaseline(normalized, sha256(remoteContent), null, true, false, null);
        } else {
            throw new IllegalArgumentException("keep must be LOCAL or REMOTE");
        }
    }

    // ---------------------------------------------------------------------
    // Baseline helpers
    // ---------------------------------------------------------------------

    private void upsertBaseline(String path, String syncedHash, String etag,
                                boolean replicated, boolean conflict, String remoteContent) {
        VaultFileSync row = baselineRepository.findById(path).orElseGet(VaultFileSync::new);
        row.setPath(path);
        row.setSyncedHash(syncedHash);
        row.setRemoteEtag(etag);
        row.setReplicated(replicated);
        row.setConflict(conflict);
        row.setRemoteContent(remoteContent);
        row.setUpdatedAt(Instant.now());
        baselineRepository.save(row);
    }

    private void upsertConflict(String path, String etag, String remoteContent) {
        VaultFileSync row = baselineRepository.findById(path).orElseGet(VaultFileSync::new);
        row.setPath(path);
        row.setRemoteEtag(etag);
        row.setConflict(true);
        row.setRemoteContent(remoteContent);
        row.setUpdatedAt(Instant.now());
        baselineRepository.save(row);
    }

    private void markNotReplicated(String path) {
        VaultFileSync row = baselineRepository.findById(path).orElseGet(VaultFileSync::new);
        row.setPath(path);
        row.setReplicated(false);
        row.setUpdatedAt(Instant.now());
        baselineRepository.save(row);
    }

    // ---------------------------------------------------------------------
    // Filesystem helpers
    // ---------------------------------------------------------------------

    private Set<String> listLocalMarkdown() {
        Path root = pathResolver.vaultRoot();
        if (!Files.exists(root)) {
            return Set.of();
        }
        Set<String> paths = new LinkedHashSet<>();
        try (var stream = Files.walk(root)) {
            stream.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".md"))
                    .filter(p -> {
                        Path rel = root.relativize(p);
                        for (Path seg : rel) {
                            if (seg.toString().startsWith(".")) {
                                return false;
                            }
                        }
                        return true;
                    })
                    .forEach(p -> paths.add(root.relativize(p).toString().replace('\\', '/')));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return paths;
    }

    private boolean localExists(String relPath) {
        return Files.exists(pathResolver.resolve(relPath));
    }

    private String readLocal(String relPath) {
        try {
            return Files.readString(pathResolver.resolve(relPath), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void writeLocal(String relPath, String content) throws IOException {
        Path resolved = pathResolver.resolve(relPath);
        Files.createDirectories(resolved.getParent());
        Files.writeString(resolved, content, StandardCharsets.UTF_8);
    }

    private void deleteLocal(String relPath) throws IOException {
        Files.deleteIfExists(pathResolver.resolve(relPath));
    }

    private Optional<String> optionalRemote(String path) {
        try {
            return webDavClient.get(path);
        } catch (IOException e) {
            log.warn("Failed to GET {} from WebDAV: {}", path, e.getMessage());
            return Optional.empty();
        }
    }

    private String fetchRemote(String path) {
        return optionalRemote(path).orElse(null);
    }

    static String sha256(String content) {
        if (content == null) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(content.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
