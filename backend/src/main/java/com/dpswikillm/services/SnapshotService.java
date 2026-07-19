package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.domain.SnapshotFile;
import com.dpswikillm.dto.FileHistoryEntryDto;
import com.dpswikillm.dto.FileVersionDto;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.SnapshotFileRepository;
import com.dpswikillm.repositories.SnapshotRepository;
import com.github.difflib.DiffUtils;
import com.github.difflib.UnifiedDiffUtils;
import com.github.difflib.patch.Patch;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SnapshotService {
    private final SnapshotRepository snapshotRepository;
    private final SnapshotFileRepository snapshotFileRepository;
    private final VaultPathResolver pathResolver;
    private final JobRepository jobRepository;

    public SnapshotService(SnapshotRepository snapshotRepository,
                           SnapshotFileRepository snapshotFileRepository,
                           VaultPathResolver pathResolver,
                           JobRepository jobRepository) {
        this.snapshotRepository = snapshotRepository;
        this.snapshotFileRepository = snapshotFileRepository;
        this.pathResolver = pathResolver;
        this.jobRepository = jobRepository;
    }

    /** Begins a snapshot with the default {@code JOB} source (used by the ingest/revert pipelines). */
    @Transactional
    public Snapshot beginSnapshot(String jobId, String operationType, String message) {
        return beginSnapshot(jobId, operationType, message, "JOB");
    }

    @Transactional
    public Snapshot beginSnapshot(String jobId, String operationType, String message, String source) {
        Snapshot snapshot = new Snapshot();
        snapshot.setJobId(jobId);
        snapshot.setOperationType(operationType);
        snapshot.setMessage(message);
        snapshot.setStatus("PENDING");
        snapshot.setSource(source);
        return snapshotRepository.save(snapshot);
    }

    @Transactional
    public void captureFile(Snapshot snapshot, String relPath) throws IOException {
        String normalized = pathResolver.normalizeRelativePath(relPath);
        if (snapshotFileRepository.findBySnapshotIdAndPath(snapshot.getId(), normalized).isPresent()) {
            return;
        }
        Path absolute = pathResolver.resolve(normalized);
        String contentBefore = Files.exists(absolute) ? Files.readString(absolute, StandardCharsets.UTF_8) : null;
        SnapshotFile sf = new SnapshotFile();
        sf.setSnapshotId(snapshot.getId());
        sf.setPath(normalized);
        sf.setContentBefore(contentBefore);
        snapshotFileRepository.save(sf);
    }

    @Transactional
    public void recordAfter(Snapshot snapshot, String relPath) throws IOException {
        String normalized = pathResolver.normalizeRelativePath(relPath);
        Path absolute = pathResolver.resolve(normalized);
        String contentAfter = Files.exists(absolute) ? Files.readString(absolute, StandardCharsets.UTF_8) : null;
        Optional<SnapshotFile> existing = snapshotFileRepository.findBySnapshotIdAndPath(snapshot.getId(), normalized);
        SnapshotFile sf = existing.orElseGet(() -> {
            SnapshotFile f = new SnapshotFile();
            f.setSnapshotId(snapshot.getId());
            f.setPath(normalized);
            return f;
        });
        sf.setContentAfter(contentAfter);
        int[] stats = diffStats(sf.getContentBefore(), contentAfter);
        sf.setLinesAdded(stats[0]);
        sf.setLinesDeleted(stats[1]);
        snapshotFileRepository.save(sf);
    }

    @Transactional
    public void finalizeSnapshot(Snapshot snapshot, Job job) {
        snapshot.setStatus("COMPLETE");
        snapshotRepository.save(snapshot);
        if (job != null) {
            job.setSnapshotId(snapshot.getId());
            jobRepository.save(job);
        }
    }

    @Transactional
    public void deleteSnapshot(UUID snapshotId) {
        snapshotFileRepository.deleteBySnapshotId(snapshotId);
        snapshotRepository.deleteById(snapshotId);
    }

    /** Returns a page of change history entries, reverse-chronological, excluding no-op entries. */
    public com.dpswikillm.dto.HistoryPageDto getFileHistory(int page, int size) {
        org.springframework.data.domain.Page<FileHistoryEntryDto> result =
                snapshotFileRepository.findHistoryPaged(PageRequest.of(page, size));
        return new com.dpswikillm.dto.HistoryPageDto(
                result.getContent(),
                result.getTotalElements(),
                result.getNumber(),
                result.getSize());
    }

    /** Unified diff for an individual per-file change entry (identified by its snapshot-file id). */
    public String getDiffByChangeId(UUID changeId) {
        SnapshotFile sf = snapshotFileRepository.findById(changeId)
                .orElseThrow(() -> new java.util.NoSuchElementException("Change not found: " + changeId));
        return buildUnifiedDiff(sf.getContentBefore(), sf.getContentAfter(), sf.getPath());
    }

    /** Prior versions of a single file (those where the file existed after the change), newest first. */
    public List<FileVersionDto> getVersions(String path) {
        String normalized = pathResolver.normalizeRelativePath(path);
        return snapshotFileRepository.findByPath(normalized).stream()
                .filter(sf -> sf.getContentAfter() != null)
                .map(sf -> {
                    Snapshot snapshot = snapshotRepository.findById(sf.getSnapshotId()).orElse(null);
                    if (snapshot == null || !"COMPLETE".equals(snapshot.getStatus())) {
                        return null;
                    }
                    return new VersionRow(sf.getId(), snapshot.getCreatedAt(), snapshot.getSource());
                })
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(VersionRow::createdAt).reversed())
                .map(v -> new FileVersionDto(v.versionId(), v.createdAt().toString(), v.source()))
                .toList();
    }

    /** Content of a specific prior version of a file. */
    public String getVersionContent(String path, UUID versionId) {
        String normalized = pathResolver.normalizeRelativePath(path);
        SnapshotFile sf = snapshotFileRepository.findById(versionId)
                .filter(f -> normalized.equals(f.getPath()) && f.getContentAfter() != null)
                .orElseThrow(() -> new java.util.NoSuchElementException("Version not found: " + versionId));
        return sf.getContentAfter();
    }

    private record VersionRow(UUID versionId, java.time.Instant createdAt, String source) {}

    @Transactional
    public void hardReset(UUID snapshotId) throws IOException {
        Snapshot snapshot = snapshotRepository.findById(snapshotId)
                .orElseThrow(() -> new java.util.NoSuchElementException("Snapshot not found: " + snapshotId));
        List<SnapshotFile> files = snapshotFileRepository.findBySnapshotId(snapshotId);
        for (SnapshotFile sf : files) {
            Path absolute = pathResolver.resolve(sf.getPath());
            if (sf.getContentBefore() == null) {
                Files.deleteIfExists(absolute);
                deleteEmptyParents(absolute.getParent(), pathResolver.vaultRoot());
            } else {
                Files.createDirectories(absolute.getParent());
                Files.writeString(absolute, sf.getContentBefore(), StandardCharsets.UTF_8);
            }
        }
        snapshot.setStatus("REVERTED");
        snapshotRepository.save(snapshot);
    }

    private void deleteEmptyParents(Path dir, Path vaultRoot) {
        while (dir != null && !dir.equals(vaultRoot) && dir.startsWith(vaultRoot)) {
            try {
                if (!Files.exists(dir)) {
                    dir = dir.getParent();
                    continue;
                }
                try (var stream = Files.list(dir)) {
                    if (stream.findFirst().isPresent()) break;
                }
                Files.delete(dir);
                dir = dir.getParent();
            } catch (IOException ignored) {
                break;
            }
        }
    }

    public List<String> getPathsForSnapshot(UUID snapshotId) {
        return snapshotFileRepository.findBySnapshotId(snapshotId).stream()
                .map(SnapshotFile::getPath)
                .toList();
    }

    public Snapshot findById(UUID snapshotId) {
        return snapshotRepository.findById(snapshotId)
                .orElseThrow(() -> new java.util.NoSuchElementException("Snapshot not found: " + snapshotId));
    }

    private String buildUnifiedDiff(String before, String after, String path) {
        List<String> beforeLines = splitLines(before);
        List<String> afterLines = splitLines(after);
        Patch<String> patch = DiffUtils.diff(beforeLines, afterLines);
        List<String> diff = UnifiedDiffUtils.generateUnifiedDiff(
                "a/" + path, "b/" + path, beforeLines, patch, 3);
        return String.join("\n", diff);
    }

    private List<String> splitLines(String content) {
        if (content == null || content.isEmpty()) {
            return List.of();
        }
        String normalized = content.replace("\r\n", "\n").replace("\r", "\n");
        return Arrays.asList(normalized.split("\n", 0));
    }

    private int[] diffStats(String before, String after) {
        List<String> beforeLines = splitLines(before);
        List<String> afterLines = splitLines(after);
        Patch<String> patch = DiffUtils.diff(beforeLines, afterLines);
        int added = 0;
        int deleted = 0;
        for (var delta : patch.getDeltas()) {
            added += delta.getTarget().size();
            deleted += delta.getSource().size();
        }
        return new int[]{added, deleted};
    }
}
