package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
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
 * Owns WebDAV replication: the synchronous per-file push on save (Section 5) and the manual pull +
 * reconcile with conflict handling triggered by the Sync button (Section 6).
 *
 * <p>Conflict detection compares three things per file — the local content hash, the remote content
 * hash, and the last-synced baseline hash ({@link VaultFileSync#getSyncedHash()}).
 */
@Service
public class WebDavSyncService {

    private static final Logger log = LoggerFactory.getLogger(WebDavSyncService.class);

    public static final String KEEP_LOCAL = "LOCAL";
    public static final String KEEP_REMOTE = "REMOTE";
    public static final String KEEP_SKIP = "SKIP";
    public static final String KEEP_MANUAL = "MANUAL";

    private final WebDavClient webDavClient;
    private final VaultFileSyncRepository baselineRepository;
    private final SnapshotService snapshotService;
    private final VaultPathResolver pathResolver;

    public WebDavSyncService(
            WebDavClient webDavClient,
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

        // Fetch remote ETags once so subsequent syncs can use the ETag fast-path immediately.
        Map<String, String> remoteEtags = new java.util.HashMap<>();
        try {
            webDavClient.list().forEach(e -> remoteEtags.put(e.path(), e.versionKey()));
        } catch (IOException e) {
            log.warn(
                    "WebDAV baseline init: could not fetch remote ETags ({}), proceeding without",
                    e.getMessage());
        }

        // Load existing baselines in one query
        Map<String, VaultFileSync> existing =
                baselineRepository.findAll().stream()
                        .collect(Collectors.toMap(VaultFileSync::getPath, b -> b));

        int initialized = 0, backfilled = 0, processed = 0;
        for (String path : localPaths) {
            processed++;
            VaultFileSync row = existing.get(path);
            if (row == null) {
                String content = readLocal(path);
                upsertBaseline(path, sha256(content), remoteEtags.get(path), true, false, null);
                initialized++;
            } else if (row.getRemoteEtag() == null && remoteEtags.containsKey(path)) {
                // Backfill ETag for existing baselines so the sync fast-path activates immediately.
                row.setRemoteEtag(remoteEtags.get(path));
                baselineRepository.save(row);
                backfilled++;
            }
            log.info("WebDAV baseline init: {}/{} — {}", processed, total, path);
        }
        log.info(
                "WebDAV baseline init: done — {} new, {} etag-backfilled, {} already up-to-date",
                initialized,
                backfilled,
                total - initialized - backfilled);
    }

    // ---------------------------------------------------------------------
    // Section 5 — synchronous per-file push on save / delete / move
    // ---------------------------------------------------------------------

    /**
     * Pushes a single saved file to WebDAV and updates its baseline. No-op when WebDAV is disabled.
     */
    public void pushSaved(String relPath, String content) {
        if (!webDavClient.isEnabled()) {
            return;
        }
        String normalized = pathResolver.normalizeRelativePath(relPath);
        try {
            webDavClient.put(normalized, content);
            // Fetch the ETag after PUT so subsequent syncs can skip this file via the fast-path.
            String etag = null;
            try {
                etag = webDavClient.getEtag(normalized);
            } catch (IOException ignored) {
            }
            upsertBaseline(normalized, sha256(content), etag, true, false, null);
        } catch (IOException e) {
            markNotReplicated(normalized);
            throw new WebDavReplicationException(
                    "Failed to replicate " + normalized + " to WebDAV", e);
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
            throw new WebDavReplicationException(
                    "Failed to replicate delete of " + normalized + " to WebDAV", e);
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
            throw new WebDavReplicationException(
                    "Failed to replicate move " + from + " -> " + to + " to WebDAV", e);
        }
    }

    // ---------------------------------------------------------------------
    // Section 6 — pull + reconcile
    // ---------------------------------------------------------------------

    public SyncResultDto sync() {
        return sync(null, null);
    }

    public SyncResultDto sync(Consumer<SyncProgressDto> onProgress) {
        return sync(onProgress, null);
    }

    /**
     * Runs the pull + reconcile. When {@code job} is non-null, the pull snapshot (capturing the
     * local mutations — files pulled from the remote and files deleted locally) is linked to that
     * job, so the sync becomes revertible through the standard job-revert mechanism. The affected
     * local paths are the union of the returned {@code pulled} and {@code deleted} lists.
     */
    public SyncResultDto sync(Consumer<SyncProgressDto> onProgress, Job job) {
        if (!webDavClient.isEnabled()) {
            throw new WebDavNotConfiguredException();
        }
        long t0 = System.currentTimeMillis();
        List<WebDavClient.RemoteEntry> remoteEntries;
        try {
            remoteEntries = webDavClient.list();
        } catch (IOException e) {
            throw new WebDavReplicationException("Failed to list WebDAV repository", e);
        }
        log.info(
                "WebDAV sync: PROPFIND listed {} remote files in {}ms",
                remoteEntries.size(),
                System.currentTimeMillis() - t0);

        Map<String, WebDavClient.RemoteEntry> remoteByPath =
                remoteEntries.stream()
                        .collect(
                                Collectors.toMap(
                                        WebDavClient.RemoteEntry::path, e -> e, (a, b) -> a));

        // Load all baselines upfront to avoid N individual DB queries in the loop.
        long tBaselines = System.currentTimeMillis();
        Map<String, VaultFileSync> allBaselines =
                baselineRepository.findAll().stream()
                        .collect(Collectors.toMap(VaultFileSync::getPath, b -> b));
        log.info(
                "WebDAV sync: loaded {} baselines in {}ms",
                allBaselines.size(),
                System.currentTimeMillis() - tBaselines);

        long tLocal = System.currentTimeMillis();
        Set<String> localPaths = listLocalMarkdown();
        log.info(
                "WebDAV sync: listed {} local files in {}ms",
                localPaths.size(),
                System.currentTimeMillis() - tLocal);
        Set<String> allPaths = new TreeSet<>();
        allPaths.addAll(localPaths);
        allPaths.addAll(remoteByPath.keySet());
        allPaths.addAll(allBaselines.keySet());

        List<String> pulled = new ArrayList<>();
        List<String> deleted = new ArrayList<>();
        List<String> pushed = new ArrayList<>();
        List<String> conflicts = new ArrayList<>();
        Snapshot pullSnapshot = null;

        int total = allPaths.size();
        int processed = 0;
        // Limit SSE events to ~100 per sync to avoid network overhead dominating.
        int progressStride = Math.max(1, total / 100);
        long tLoop = System.currentTimeMillis();

        for (String path : allPaths) {
            processed++;
            if (onProgress != null && (processed % progressStride == 0 || processed == total)) {
                onProgress.accept(new SyncProgressDto(processed, total, path));
            }

            VaultFileSync baseline = allBaselines.get(path);
            String syncedHash = baseline != null ? baseline.getSyncedHash() : null;
            String syncedEtag = baseline != null ? baseline.getRemoteEtag() : null;

            boolean localExists = localPaths.contains(path);
            WebDavClient.RemoteEntry remote = remoteByPath.get(path);
            String currentRemoteEtag = remote != null ? remote.versionKey() : null;

            // ETag fast-path: remote unchanged when both stored and current ETags are non-null and
            // equal.
            // Servers that don't return ETags always fall back to fetching content (conservative).
            boolean remoteEtagUnchanged =
                    syncedEtag != null
                            && currentRemoteEtag != null
                            && Objects.equals(currentRemoteEtag, syncedEtag);

            // Use file mtime to detect local changes without reading content.
            // If the file hasn't been touched since the last sync, we trust the stored hash.
            boolean localMayHaveChanged = true;
            if (baseline != null && baseline.getUpdatedAt() != null && localExists) {
                try {
                    Instant mtime =
                            Files.getLastModifiedTime(pathResolver.resolve(path)).toInstant();
                    localMayHaveChanged = mtime.isAfter(baseline.getUpdatedAt());
                } catch (IOException ignored) {
                }
            }

            // Fast-path: nothing changed on either side.
            if (!localMayHaveChanged && remoteEtagUnchanged) {
                continue;
            }

            // Read local content lazily — only when we can't skip via mtime + ETag.
            String localContent = localExists ? readLocal(path) : null;
            String localHash = localContent != null ? sha256(localContent) : null;
            boolean localChanged = !Objects.equals(localHash, syncedHash);

            // Determine remote content: fetch only when ETag says it changed.
            String remoteContent;
            String remoteHash;
            if (remote == null) {
                remoteContent = null;
                remoteHash = null;
            } else if (remoteEtagUnchanged && syncedHash != null) {
                // Remote is still at syncedHash — no download needed.
                remoteContent = null;
                remoteHash = syncedHash;
            } else {
                remoteContent = fetchRemote(path);
                remoteHash = remoteContent != null ? sha256(remoteContent) : null;
            }

            if (Objects.equals(localHash, remoteHash)) {
                // Already identical (or converged independently); refresh the baseline.
                if (localHash == null) {
                    baselineRepository.deleteById(path);
                } else {
                    upsertBaseline(path, localHash, currentRemoteEtag, true, false, null);
                }
                continue;
            }

            boolean remoteChanged = !Objects.equals(remoteHash, syncedHash);

            if (remoteChanged && !localChanged) {
                if (pullSnapshot == null) {
                    pullSnapshot =
                            snapshotService.beginSnapshot(
                                    job != null ? job.getId().toString() : null,
                                    "webdav-sync",
                                    "WebDAV sync",
                                    "WEBDAV_PULL");
                }
                // Ensure we have the actual content before applying.
                if (remoteContent == null && remote != null) {
                    remoteContent = fetchRemote(path);
                    remoteHash = remoteContent != null ? sha256(remoteContent) : null;
                }
                applyRemote(pullSnapshot, path, remoteContent, remote, remoteHash, pulled, deleted);
            } else if (localChanged && !remoteChanged) {
                // Local changed, remote is at the last synced baseline — push the local version.
                // This covers: new files, job-applied mutations (health check, enrich, keywords,
                // etc.) that write directly to disk bypassing the per-save WebDAV push.
                if (localContent != null) {
                    try {
                        webDavClient.put(path, localContent);
                        String newEtag = null;
                        try {
                            newEtag = webDavClient.getEtag(path);
                        } catch (IOException ignored) {
                        }
                        upsertBaseline(path, localHash, newEtag, true, false, null);
                        pushed.add(path);
                    } catch (IOException e) {
                        log.warn(
                                "WebDAV sync: failed to push {} to remote: {}",
                                path,
                                e.getMessage());
                    }
                } else {
                    // File deleted locally but still present on remote — replicate the delete.
                    try {
                        webDavClient.delete(path);
                        baselineRepository.deleteById(path);
                        pushed.add(path);
                    } catch (IOException e) {
                        log.warn(
                                "WebDAV sync: failed to delete {} from remote: {}",
                                path,
                                e.getMessage());
                    }
                }
            } else {
                // Both sides changed since the last sync -> conflict; do not overwrite either side.
                // Ensure we have remote content to store in the conflict record.
                if (remoteContent == null && remote != null) {
                    remoteContent = fetchRemote(path);
                }
                upsertConflict(path, currentRemoteEtag, remoteContent);
                conflicts.add(path);
            }
        }

        log.info(
                "WebDAV sync: loop done in {}ms — {} pulled, {} deleted, {} pushed, {} conflicts",
                System.currentTimeMillis() - tLoop,
                pulled.size(),
                deleted.size(),
                pushed.size(),
                conflicts.size());
        if (pullSnapshot != null) {
            snapshotService.finalizeSnapshot(pullSnapshot, job);
        }
        return new SyncResultDto(pulled, deleted, pushed, conflicts);
    }

    private void applyRemote(
            Snapshot snapshot,
            String path,
            String remoteContent,
            WebDavClient.RemoteEntry remote,
            String remoteHash,
            List<String> pulled,
            List<String> deleted) {
        try {
            snapshotService.captureFile(snapshot, path);
            if (remoteContent != null) {
                writeLocal(path, remoteContent);
                snapshotService.recordAfter(snapshot, path);
                upsertBaseline(
                        path,
                        remoteHash,
                        remote != null ? remote.versionKey() : null,
                        true,
                        false,
                        null);
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
                .map(
                        b ->
                                new ConflictDto(
                                        b.getPath(),
                                        localExists(b.getPath()) ? readLocal(b.getPath()) : null,
                                        b.getRemoteContent()))
                .toList();
    }

    public void resolveConflict(String path, String keep, String content) {
        String normalized = pathResolver.normalizeRelativePath(path);
        VaultFileSync baseline =
                baselineRepository
                        .findById(normalized)
                        .filter(VaultFileSync::isConflict)
                        .orElseThrow(
                                () ->
                                        new java.util.NoSuchElementException(
                                                "No conflict for path: " + path));

        if (KEEP_LOCAL.equalsIgnoreCase(keep)) {
            String localContent = localExists(normalized) ? readLocal(normalized) : "";
            try {
                webDavClient.put(normalized, localContent);
            } catch (IOException e) {
                throw new WebDavReplicationException(
                        "Failed to push resolved local content for " + normalized, e);
            }
            upsertBaseline(normalized, sha256(localContent), null, true, false, null);
        } else if (KEEP_REMOTE.equalsIgnoreCase(keep)) {
            String remoteContent =
                    baseline.getRemoteContent() == null ? "" : baseline.getRemoteContent();
            Snapshot snapshot =
                    snapshotService.beginSnapshot(
                            null, "webdav-conflict-resolve", normalized, "WEBDAV_PULL");
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
        } else if (KEEP_SKIP.equalsIgnoreCase(keep)) {
            upsertBaseline(
                    normalized,
                    baseline.getSyncedHash(),
                    baseline.getRemoteEtag(),
                    baseline.isReplicated(),
                    false,
                    null);
        } else if (KEEP_MANUAL.equalsIgnoreCase(keep)) {
            if (content == null || content.isBlank()) {
                throw new IllegalArgumentException("content is required for MANUAL resolution");
            }
            try {
                webDavClient.put(normalized, content);
            } catch (IOException e) {
                throw new WebDavReplicationException(
                        "Failed to push manual resolved content for " + normalized, e);
            }
            Snapshot snapshot =
                    snapshotService.beginSnapshot(
                            null, "webdav-conflict-resolve", normalized, "WEBDAV_PULL");
            try {
                snapshotService.captureFile(snapshot, normalized);
                writeLocal(normalized, content);
                snapshotService.recordAfter(snapshot, normalized);
            } catch (IOException e) {
                snapshotService.deleteSnapshot(snapshot.getId());
                throw new UncheckedIOException(e);
            }
            snapshotService.finalizeSnapshot(snapshot, null);
            upsertBaseline(normalized, sha256(content), null, true, false, null);
        } else {
            throw new IllegalArgumentException("keep must be LOCAL, REMOTE, SKIP, or MANUAL");
        }
    }

    // ---------------------------------------------------------------------
    // Baseline helpers
    // ---------------------------------------------------------------------

    private void upsertBaseline(
            String path,
            String syncedHash,
            String etag,
            boolean replicated,
            boolean conflict,
            String remoteContent) {
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
                    .filter(
                            p -> {
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
