package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.Operation;
import com.dpswikillm.domain.OperationCommitRequest;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.OperationRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JobRevertService {
    private final JobRepository jobRepository;
    private final OperationRepository operationRepository;
    private final GitService gitService;
    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final JobLifecycleService lifecycleService;
    private final ObjectMapper objectMapper;

    public JobRevertService(JobRepository jobRepository,
                            OperationRepository operationRepository,
                            GitService gitService,
                            ReindexService reindexService,
                            EmbeddingIndexService embeddingIndexService,
                            JobLifecycleService lifecycleService,
                            ObjectMapper objectMapper) {
        this.jobRepository = jobRepository;
        this.operationRepository = operationRepository;
        this.gitService = gitService;
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

        String preHead = gitService.getHead().orElse(null);
        PipelineTx tx = new PipelineTx();
        if (preHead != null) {
            tx.onRollback("git-reset", () -> gitService.resetHard(preHead));
        }

        try {
            lifecycleService.transition(revertJob.getId(), JobStatus.PROGRESS, "git-revert",
                    "Preparing inverse commit for job " + target.getId());
            gitService.revertRangeNoCommit(target.getCommitRange());
            List<String> revertedPaths = gitService.changedPaths();

            lifecycleService.transition(revertJob.getId(), JobStatus.PROGRESS, "reindex",
                    "Reindexing after revert");
            reindexService.reindexWiki();
            embeddingIndexService.embedIncremental();

            var commit = gitService.commitOperation(new OperationCommitRequest(
                    "job-revert",
                    revertJob.getId().toString(),
                    "Revert job " + target.getId(),
                    revertedPaths,
                    Map.of("target_job_id", target.getId().toString())));

            revertJob.setPreGitSha(preHead);
            revertJob.setCommitRange(commit.commitRange());
            revertJob.setAffectedPaths(toJson(append(revertedPaths, commit.changeLogPath())));
            revertJob.setResult("{\"target_job_id\":\"" + target.getId() + "\"}");
            jobRepository.save(revertJob);

            target.transitionTo(JobStatus.REVERTED);
            target.setResult("{\"reverted_by_job_id\":\"" + revertJob.getId() + "\"}");
            jobRepository.save(target);

            recordOperation(revertJob, affectedPaths.size(), commit.commitSha());
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
        if (target.getCommitRange() == null || target.getCommitRange().isBlank()) {
            throw new IllegalArgumentException("Target job has no commit range");
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

    private List<String> append(List<String> paths, String path) {
        List<String> result = new ArrayList<>(paths);
        if (path != null && !path.isBlank() && !result.contains(path)) {
            result.add(path);
        }
        return result;
    }

    private String toJson(List<String> paths) {
        try {
            return objectMapper.writeValueAsString(paths);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to serialize affected paths", ex);
        }
    }

    private void recordOperation(Job job, int affectedNoteCount, String commitSha) {
        Operation operation = new Operation();
        operation.setJobId(job.getId());
        operation.setType("job-revert");
        operation.setStatus("COMPLETED");
        operation.setCommitSha(commitSha);
        operation.setAffectedNoteCount(affectedNoteCount);
        operation.setCompletedAt(Instant.now());
        operationRepository.save(operation);
    }
}
