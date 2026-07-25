package com.dpswikillm.services;

import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.domain.ConnectionCandidateSource;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.domain.Operation;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.dto.ReviewRequest;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.OperationRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuidedReviewService {
    private final JobRepository jobRepository;
    private final JobConnectionCandidateRepository candidateRepository;
    private final OperationRepository operationRepository;
    private final MutationApplier mutationApplier;
    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final SnapshotService snapshotService;
    private final JobLifecycleService lifecycleService;
    private final ObjectMapper objectMapper;

    public GuidedReviewService(
            JobRepository jobRepository,
            JobConnectionCandidateRepository candidateRepository,
            OperationRepository operationRepository,
            MutationApplier mutationApplier,
            ReindexService reindexService,
            EmbeddingIndexService embeddingIndexService,
            SnapshotService snapshotService,
            JobLifecycleService lifecycleService,
            ObjectMapper objectMapper) {
        this.jobRepository = jobRepository;
        this.candidateRepository = candidateRepository;
        this.operationRepository = operationRepository;
        this.mutationApplier = mutationApplier;
        this.reindexService = reindexService;
        this.embeddingIndexService = embeddingIndexService;
        this.snapshotService = snapshotService;
        this.lifecycleService = lifecycleService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public List<JobConnectionCandidate> candidatesForJob(java.util.UUID jobId) {
        return candidateRepository.findByJobIdOrderByCreatedAtAsc(jobId);
    }

    @Transactional
    public MutationResult review(java.util.UUID jobId, ReviewRequest request) throws Exception {
        Job job = jobRepository.findById(jobId).orElseThrow();
        List<JobConnectionCandidate> candidates =
                candidateRepository.findByJobIdOrderByCreatedAtAsc(jobId);
        Map<java.util.UUID, JobConnectionCandidate> byId = new LinkedHashMap<>();
        for (JobConnectionCandidate candidate : candidates) {
            byId.put(candidate.getId(), candidate);
        }

        if (request.candidates() != null) {
            for (var decision : request.candidates()) {
                JobConnectionCandidate candidate = byId.get(decision.candidateId());
                if (candidate != null && decision.decision() != null) {
                    candidate.setDecision(decision.decision());
                }
            }
        }
        candidateRepository.saveAll(candidates);

        String sourceNotePath =
                candidates.isEmpty() ? null : candidates.getFirst().getProposedLink();
        List<JobConnectionCandidate> accepted =
                candidates.stream()
                        .filter(
                                candidate ->
                                        candidate.getDecision()
                                                == ConnectionCandidateDecision.accepted)
                        .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
        if (request.manualTargetPaths() != null && sourceNotePath != null) {
            for (String targetPath : request.manualTargetPaths()) {
                JobConnectionCandidate manual = new JobConnectionCandidate();
                manual.setJobId(jobId);
                manual.setTargetPath(targetPath);
                manual.setProposedLink(sourceNotePath);
                manual.setProposedSection("Related");
                manual.setSource(ConnectionCandidateSource.llm);
                manual.setScore(1.0);
                manual.setDecision(ConnectionCandidateDecision.accepted);
                accepted.add(candidateRepository.save(manual));
            }
        }

        MutationResult result = applyAccepted(job, accepted, "guided-review-" + jobId, true);
        if (result.created().isEmpty() && result.updated().isEmpty()) {
            recordOperation(job, result, null);
        }
        return result;
    }

    @Transactional
    public MutationResult applyAccepted(
            Job job,
            List<JobConnectionCandidate> accepted,
            String planId,
            boolean commitImmediately)
            throws Exception {
        if (accepted == null || accepted.isEmpty()) {
            return MutationResult.empty(planId);
        }
        candidateRepository.saveAll(accepted);
        List<MutationAction> actions = new ArrayList<>();
        for (JobConnectionCandidate candidate : accepted) {
            actions.add(
                    MutationAction.merge(
                            MutationActionType.update,
                            candidate.getTargetPath(),
                            null,
                            Map.of(),
                            Map.of(
                                    candidate.getProposedSection() == null
                                            ? "Related"
                                            : candidate.getProposedSection(),
                                    List.of("[[" + candidate.getProposedLink() + "]]"),
                                    "Sources",
                                    List.of("[[" + candidate.getProposedLink() + "]]")),
                            "review:"
                                    + job.getId()
                                    + ":"
                                    + candidate.getTargetPath()
                                    + ":"
                                    + candidate.getProposedLink()));
        }

        // Reverse (forward) links: the source note links back out to each accepted target so every
        // connection is bidirectional, regardless of the flow (unattended or guided review).
        Map<String, LinkedHashSet<String>> forwardLinksBySource = new LinkedHashMap<>();
        for (JobConnectionCandidate candidate : accepted) {
            if (candidate.getProposedLink() == null) {
                continue;
            }
            forwardLinksBySource
                    .computeIfAbsent(candidate.getProposedLink(), key -> new LinkedHashSet<>())
                    .add("[[" + candidate.getTargetPath() + "]]");
        }
        for (Map.Entry<String, LinkedHashSet<String>> entry : forwardLinksBySource.entrySet()) {
            actions.add(
                    MutationAction.merge(
                            MutationActionType.update,
                            entry.getKey(),
                            null,
                            Map.of(),
                            Map.of("Related", new ArrayList<>(entry.getValue())),
                            "forward-links:" + job.getId() + ":" + entry.getKey()));
        }

        lifecycleService.transition(
                job.getId(),
                JobStatus.PROGRESS,
                "review-apply",
                "Applying accepted connection candidates");

        // Capture before state for all target paths, source notes and idempotency ledger
        Snapshot snapshot = resolveSnapshot(job);
        for (JobConnectionCandidate candidate : accepted) {
            snapshotService.captureFile(snapshot, candidate.getTargetPath());
        }
        for (String source : forwardLinksBySource.keySet()) {
            snapshotService.captureFile(snapshot, source);
        }
        snapshotService.captureFile(snapshot, "state/runtime/idempotency-keys.json");

        MutationResult result = mutationApplier.apply(new MutationPlan(planId, actions));
        reindexService.reindexWiki();
        embeddingIndexService.embedIncremental(
                p ->
                        lifecycleService.progress(
                                job,
                                "embedding-scan",
                                "embeddings",
                                "{\"current\":" + p.processed() + ",\"total\":" + p.total() + "}"));

        for (String p : result.created()) snapshotService.recordAfter(snapshot, p);
        for (String p : result.updated()) snapshotService.recordAfter(snapshot, p);
        snapshotService.recordAfter(snapshot, "state/runtime/idempotency-keys.json");

        if (commitImmediately) {
            List<String> changed = new ArrayList<>();
            changed.addAll(result.created());
            changed.addAll(result.updated());
            if (!changed.isEmpty()) {
                changed.add("state/runtime/idempotency-keys.json");
                job.setAffectedPaths(toJson(appendAffectedPaths(job, changed)));
                jobRepository.save(job);
                recordOperation(job, result, snapshot.getId().toString());
            }
            snapshot.setMessage("Apply guided ingestion review");
            snapshotService.finalizeSnapshot(snapshot, job);
            lifecycleService.transition(
                    job.getId(), JobStatus.COMPLETED, "completed", "Guided review completed");
        }

        return result;
    }

    private Snapshot resolveSnapshot(Job job) {
        if (job.getSnapshotId() != null) {
            return snapshotService.findById(job.getSnapshotId());
        }
        Snapshot snapshot =
                snapshotService.beginSnapshot(job.getId().toString(), "guided-review", null);
        job.setSnapshotId(snapshot.getId());
        jobRepository.save(job);
        return snapshot;
    }

    private List<String> appendAffectedPaths(Job job, List<String> changed) {
        List<String> paths = new ArrayList<>();
        if (job.getAffectedPaths() != null && !job.getAffectedPaths().isBlank()) {
            try {
                paths.addAll(
                        objectMapper.readValue(
                                job.getAffectedPaths(), new TypeReference<List<String>>() {}));
            } catch (Exception ignored) {
                paths.clear();
            }
        }
        for (String path : changed) {
            if (!paths.contains(path)) {
                paths.add(path);
            }
        }
        return paths;
    }

    private String toJson(List<String> paths) {
        try {
            return objectMapper.writeValueAsString(paths);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to serialize affected paths", ex);
        }
    }

    private void recordOperation(Job job, MutationResult result, String snapshotId) {
        Operation operation = new Operation();
        operation.setJobId(job.getId());
        operation.setType("guided-review");
        operation.setStatus("COMPLETED");
        operation.setCommitSha(snapshotId);
        operation.setAffectedNoteCount(result.created().size() + result.updated().size());
        operation.setCompletedAt(Instant.now());
        operationRepository.save(operation);
    }
}
