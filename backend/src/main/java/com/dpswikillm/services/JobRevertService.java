package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.Operation;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.OperationRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JobRevertService {
    private final JobRepository jobRepository;
    private final OperationRepository operationRepository;
    private final SnapshotService snapshotService;
    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final JobLifecycleService lifecycleService;
    private final ObjectMapper objectMapper;

    public JobRevertService(JobRepository jobRepository,
                            OperationRepository operationRepository,
                            SnapshotService snapshotService,
                            ReindexService reindexService,
                            EmbeddingIndexService embeddingIndexService,
                            JobLifecycleService lifecycleService,
                            ObjectMapper objectMapper) {
        this.jobRepository = jobRepository;
        this.operationRepository = operationRepository;
        this.snapshotService = snapshotService;
        this.reindexService = reindexService;
        this.embeddingIndexService = embeddingIndexService;
        this.lifecycleService = lifecycleService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void revert(Job revertJob) throws Exception {
        UUID targetJobId = UUID.fromString(revertJob.getPayloadRef());
        Job target = jobRepository.findById(targetJobId).orElseThrow();
        validateTarget(target);

        List<String> affectedPaths = affectedPaths(target);
        List<Job> conflicts = conflictsFor(target, affectedPaths);
        if (!conflicts.isEmpty()) {
            String message = "Revert conflict: later jobs touched " + String.join(", ", conflictPaths(conflicts, affectedPaths));
            lifecycleService.transition(revertJob.getId(), JobStatus.FAILED, "revert-conflict", message);
            return;
        }

        UUID targetSnapshotId = target.getSnapshotId();
        List<String> snapshotPaths = snapshotService.getPathsForSnapshot(targetSnapshotId);

        Snapshot revertSnapshot = snapshotService.beginSnapshot(
                revertJob.getId().toString(), "job-revert", "Revert job " + target.getId());
        PipelineTx tx = new PipelineTx();
        tx.onRollback("delete-revert-snapshot", () -> snapshotService.deleteSnapshot(revertSnapshot.getId()));

        try {
            lifecycleService.transition(revertJob.getId(), JobStatus.PROGRESS, "snapshot-revert",
                    "Preparing revert for job " + target.getId());

            for (String path : snapshotPaths) {
                snapshotService.captureFile(revertSnapshot, path);
            }

            snapshotService.hardReset(targetSnapshotId);

            for (String path : snapshotPaths) {
                snapshotService.recordAfter(revertSnapshot, path);
            }

            lifecycleService.transition(revertJob.getId(), JobStatus.PROGRESS, "reindex",
                    "Reindexing after revert");
            reindexService.reindexWiki();
            embeddingIndexService.embedIncremental();

            snapshotService.finalizeSnapshot(revertSnapshot, revertJob);
            revertJob.setAffectedPaths(toJson(snapshotPaths));
            revertJob.setResult("{\"target_job_id\":\"" + target.getId() + "\"}");
            jobRepository.save(revertJob);

            target.transitionTo(JobStatus.REVERTED);
            target.setResult("{\"reverted_by_job_id\":\"" + revertJob.getId() + "\"}");
            jobRepository.save(target);

            recordOperation(revertJob, affectedPaths.size(), revertSnapshot.getId().toString());
            lifecycleService.transition(target.getId(), JobStatus.REVERTED, "reverted",
                    "Job reverted by " + revertJob.getId());
            lifecycleService.transition(revertJob.getId(), JobStatus.COMPLETED, "completed",
                    "Revert completed");
            tx.clear();
        } catch (Exception ex) {
            tx.rollback();
            lifecycleService.transition(revertJob.getId(), JobStatus.FAILED, "failed", ex.getMessage());
            throw ex;
        }
    }

    private void validateTarget(Job target) {
        if (target.getType() == JobType.REVERT) {
            throw new IllegalArgumentException("Cannot revert a revert job");
        }
        if (target.getStatus() == JobStatus.REVERTED) {
            throw new IllegalArgumentException("Job is already reverted");
        }
        if (target.getStatus() != JobStatus.COMPLETED && target.getStatus() != JobStatus.AWAITING_REVIEW) {
            throw new IllegalArgumentException("Only completed state-mutating jobs can be reverted");
        }
        if (target.getSnapshotId() == null) {
            throw new IllegalArgumentException("Target job has no snapshot");
        }
    }

    private List<Job> conflictsFor(Job target, List<String> affectedPaths) {
        if (target.getCreatedAt() == null || affectedPaths.isEmpty()) {
            return List.of();
        }
        Set<String> targetPaths = new LinkedHashSet<>(affectedPaths);
        return jobRepository.findByCreatedAtAfterOrderByCreatedAtAsc(target.getCreatedAt()).stream()
                .filter(job -> !job.getId().equals(target.getId()))
                .filter(job -> job.getType() != JobType.ANSWER)
                .filter(job -> job.getStatus() == JobStatus.COMPLETED || job.getStatus() == JobStatus.AWAITING_REVIEW)
                .filter(job -> overlaps(targetPaths, affectedPaths(job)))
                .toList();
    }

    private boolean overlaps(Set<String> targetPaths, List<String> candidatePaths) {
        for (String path : candidatePaths) {
            if (targetPaths.contains(path)) {
                return true;
            }
        }
        return false;
    }

    private List<String> conflictPaths(List<Job> conflicts, List<String> affectedPaths) {
        Set<String> targetPaths = new LinkedHashSet<>(affectedPaths);
        Set<String> paths = new LinkedHashSet<>();
        for (Job conflict : conflicts) {
            for (String path : affectedPaths(conflict)) {
                if (targetPaths.contains(path)) {
                    paths.add(path);
                }
            }
        }
        return List.copyOf(paths);
    }

    private List<String> affectedPaths(Job job) {
        if (job.getAffectedPaths() == null || job.getAffectedPaths().isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(job.getAffectedPaths(), new TypeReference<List<String>>() {});
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid affected paths for job " + job.getId(), ex);
        }
    }

    private String toJson(List<String> paths) {
        try {
            return objectMapper.writeValueAsString(paths);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to serialize affected paths", ex);
        }
    }

    private void recordOperation(Job job, int affectedNoteCount, String snapshotId) {
        Operation operation = new Operation();
        operation.setJobId(job.getId());
        operation.setType("job-revert");
        operation.setStatus("COMPLETED");
        operation.setCommitSha(snapshotId);
        operation.setAffectedNoteCount(affectedNoteCount);
        operation.setCompletedAt(Instant.now());
        operationRepository.save(operation);
    }
}
