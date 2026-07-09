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
import com.dpswikillm.domain.OperationCommitRequest;
import com.dpswikillm.dto.ReviewRequest;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.OperationRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
    private final GitService gitService;
    private final JobLifecycleService lifecycleService;
    private final ObjectMapper objectMapper;

    public GuidedReviewService(JobRepository jobRepository,
                               JobConnectionCandidateRepository candidateRepository,
                               OperationRepository operationRepository,
                               MutationApplier mutationApplier,
                               ReindexService reindexService,
                               EmbeddingIndexService embeddingIndexService,
                               GitService gitService,
                               JobLifecycleService lifecycleService,
                               ObjectMapper objectMapper) {
        this.jobRepository = jobRepository;
        this.candidateRepository = candidateRepository;
        this.operationRepository = operationRepository;
        this.mutationApplier = mutationApplier;
        this.reindexService = reindexService;
        this.embeddingIndexService = embeddingIndexService;
        this.gitService = gitService;
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
        List<JobConnectionCandidate> candidates = candidateRepository.findByJobIdOrderByCreatedAtAsc(jobId);
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

        String sourceNotePath = candidates.isEmpty() ? null : candidates.getFirst().getProposedLink();
        List<JobConnectionCandidate> accepted = candidates.stream()
                .filter(candidate -> candidate.getDecision() == ConnectionCandidateDecision.accepted)
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

        MutationResult result = applyAccepted(job, accepted, "guided-review-" + jobId);
        if (result.created().isEmpty() && result.updated().isEmpty()) {
            recordOperation(job, result, null);
        }
        return result;
    }

    @Transactional
    public MutationResult applyAccepted(Job job, List<JobConnectionCandidate> accepted, String planId) throws Exception {
        if (accepted == null || accepted.isEmpty()) {
            return MutationResult.empty(planId);
        }
        candidateRepository.saveAll(accepted);
        List<MutationAction> actions = new ArrayList<>();
        for (JobConnectionCandidate candidate : accepted) {
            actions.add(new MutationAction(
                    MutationActionType.update,
                    candidate.getTargetPath(),
                    null,
                    Map.of(),
                    Map.of(
                            candidate.getProposedSection() == null ? "Related" : candidate.getProposedSection(),
                            List.of("[[" + candidate.getProposedLink() + "]]"),
                            "Sources",
                            List.of("[[" + candidate.getProposedLink() + "]]")),
                    "review:" + job.getId() + ":" + candidate.getTargetPath() + ":" + candidate.getProposedLink()));
        }

        lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "review-apply", "Applying accepted connection candidates");
        MutationResult result = mutationApplier.apply(new MutationPlan(planId, actions));
        reindexService.reindexWiki();
        embeddingIndexService.embedIncremental();

        List<String> changed = new ArrayList<>();
        changed.addAll(result.created());
        changed.addAll(result.updated());
        if (!changed.isEmpty()) {
            changed.add("state/runtime/idempotency-keys.json");
            var commit = gitService.commitOperation(new OperationCommitRequest(
                    "guided-review",
                    job.getId().toString(),
                    "Apply guided ingestion review",
                    changed,
                    Map.of("accepted", accepted.size())));
            job.setCommitRange(appendRange(job, commit.commitRange()));
            job.setAffectedPaths(toJson(appendAffectedPaths(job, changed)));
            jobRepository.save(job);
            recordOperation(job, result, commit.commitSha());
        }

        lifecycleService.transition(job.getId(), JobStatus.COMPLETED, "completed", "Guided review completed");
        return result;
    }

    private String appendRange(Job job, String commitRange) {
        String existing = job.getCommitRange();
        return existing == null || existing.isBlank() ? commitRange : existing + "," + commitRange;
    }

    private List<String> appendAffectedPaths(Job job, List<String> changed) {
        List<String> paths = new ArrayList<>();
        if (job.getAffectedPaths() != null && !job.getAffectedPaths().isBlank()) {
            try {
                paths.addAll(objectMapper.readValue(job.getAffectedPaths(), new TypeReference<List<String>>() {}));
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

    private void recordOperation(Job job, MutationResult result, String commitSha) {
        Operation operation = new Operation();
        operation.setJobId(job.getId());
        operation.setType("guided-review");
        operation.setStatus("COMPLETED");
        operation.setCommitSha(commitSha);
        operation.setAffectedNoteCount(result.created().size() + result.updated().size());
        operation.setCompletedAt(Instant.now());
        operationRepository.save(operation);
    }
}
