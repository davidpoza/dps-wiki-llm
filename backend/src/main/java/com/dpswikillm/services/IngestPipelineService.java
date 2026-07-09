package com.dpswikillm.services;

import com.dpswikillm.domain.GuardrailResult;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.OperationCommitRequest;
import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.repositories.JobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IngestPipelineService {
    private final SourceNormalizer sourceNormalizer;
    private final SourceNoteLlmService sourceNoteLlmService;
    private final SourceNotePlanner sourceNotePlanner;
    private final LlmMutationPlanService llmMutationPlanService;
    private final MutationGuardrailService guardrailService;
    private final MutationApplier mutationApplier;
    private final RootIndexService rootIndexService;
    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final GitService gitService;
    private final VaultPathResolver pathResolver;
    private final JobLifecycleService lifecycleService;
    private final JobRepository jobRepository;
    private final ConnectionDiscoveryService connectionDiscoveryService;
    private final GuidedReviewService guidedReviewService;
    private final ObjectMapper objectMapper;

    public IngestPipelineService(SourceNormalizer sourceNormalizer,
                                 SourceNoteLlmService sourceNoteLlmService,
                                 SourceNotePlanner sourceNotePlanner,
                                 LlmMutationPlanService llmMutationPlanService,
                                 MutationGuardrailService guardrailService,
                                 MutationApplier mutationApplier,
                                 RootIndexService rootIndexService,
                                 ReindexService reindexService,
                                 EmbeddingIndexService embeddingIndexService,
                                 GitService gitService,
                                 VaultPathResolver pathResolver,
                                 JobLifecycleService lifecycleService,
                                 JobRepository jobRepository,
                                 ConnectionDiscoveryService connectionDiscoveryService,
                                 GuidedReviewService guidedReviewService,
                                 ObjectMapper objectMapper) {
        this.sourceNormalizer = sourceNormalizer;
        this.sourceNoteLlmService = sourceNoteLlmService;
        this.sourceNotePlanner = sourceNotePlanner;
        this.llmMutationPlanService = llmMutationPlanService;
        this.guardrailService = guardrailService;
        this.mutationApplier = mutationApplier;
        this.rootIndexService = rootIndexService;
        this.reindexService = reindexService;
        this.embeddingIndexService = embeddingIndexService;
        this.gitService = gitService;
        this.pathResolver = pathResolver;
        this.lifecycleService = lifecycleService;
        this.jobRepository = jobRepository;
        this.connectionDiscoveryService = connectionDiscoveryService;
        this.guidedReviewService = guidedReviewService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void run(Job job) throws Exception {
        String preHead = gitService.getHead().orElse(null);
        Path ledger = pathResolver.resolve("state/runtime/idempotency-keys.json");
        String ledgerSnapshot = Files.exists(ledger) ? Files.readString(ledger, StandardCharsets.UTF_8) : null;
        PipelineTx tx = new PipelineTx();
        if (preHead != null) {
            tx.onRollback("git-reset", () -> gitService.resetHard(preHead));
        }
        tx.onRollback("restore-idempotency-ledger", () -> restoreLedger(ledger, ledgerSnapshot));

        try {
            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "normalization", "Normalizing raw artifact");
            NormalizedSourcePayload payload = sourceNormalizer.normalize(job.getPayloadRef());
            lifecycleService.fileEvent(job, payload.rawPath(), "read");

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "llm-cleaning", "Cleaning source note with LLM");
            payload = payload.withSourceNote(sourceNoteLlmService.clean(payload));

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "baseline-apply", "Applying baseline source note");
            MutationPlan baseline = sourceNotePlanner.baselinePlan(payload);
            MutationResult baselineResult = mutationApplier.apply(baseline);
            String sourceNotePath = sourceNotePlanner.sourceNotePath(payload);
            boolean indexUpdated = rootIndexService.addEntry(payload.title(), sourceNotePath);
            lifecycleService.fileEvent(job, sourceNotePath, baselineResult.created().isEmpty() ? "update" : "create");
            lifecycleService.fileEvent(job, "INDEX.md", indexUpdated ? "update" : "read");

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "reindex", "Reindexing wiki documents");
            reindexService.reindexWiki();
            embeddingIndexService.embedIncremental();

            List<String> baselinePaths = new ArrayList<>(List.of(sourceNotePath, "INDEX.md", "state/runtime/idempotency-keys.json"));
            var baselineCommit = gitService.commitOperation(new OperationCommitRequest(
                    "ingest-baseline",
                    job.getId().toString(),
                    "Ingest baseline source note: " + payload.title(),
                    baselinePaths,
                    java.util.Map.of("source_id", payload.sourceId())));
            recordCommitMetadata(job, preHead, baselineCommit.commitRange(), List.of(sourceNotePath, "INDEX.md"));

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "connection-discovery", "Requesting optional connection plan");
            MutationPlan llmPlan = requestOptionalPlan(payload, sourceNotePath);
            GuardrailResult guarded = guardrailService.guardrail(llmPlan, payload.rawPath(), sourceNotePath);
            var candidates = connectionDiscoveryService.discoverAndPersist(job, payload, sourceNotePath, guarded.plan());

            if (job.getMode() == JobMode.validated) {
                lifecycleService.transition(job.getId(), JobStatus.AWAITING_REVIEW, "awaiting-review",
                        "Baseline committed; connection application deferred to guided review");
                lifecycleService.awaitingReview(job, "Connection candidates ready for review", objectMapper.writeValueAsString(candidates));
                tx.clear();
                return;
            }

            if (!candidates.isEmpty()) {
                candidates.forEach(candidate -> candidate.setDecision(ConnectionCandidateDecision.accepted));
                guidedReviewService.applyAccepted(job, candidates, "unattended-connections-" + job.getId());
            }

            lifecycleService.transition(job.getId(), JobStatus.COMPLETED, "completed", "Ingest completed");
            tx.clear();
        } catch (Exception ex) {
            tx.rollback();
            lifecycleService.transition(job.getId(), JobStatus.FAILED, "failed", ex.getMessage());
            throw ex;
        }
    }

    private MutationPlan requestOptionalPlan(NormalizedSourcePayload payload, String sourceNotePath) {
        try {
            return llmMutationPlanService.requestPlan(payload, sourceNotePath);
        } catch (RuntimeException ex) {
            return llmMutationPlanService.emptyPlan(payload);
        }
    }

    private void restoreLedger(Path ledger, String snapshot) throws IOException {
        if (snapshot == null) {
            Files.deleteIfExists(ledger);
            return;
        }
        Files.createDirectories(ledger.getParent());
        Files.writeString(ledger, snapshot, StandardCharsets.UTF_8);
    }

    private void recordCommitMetadata(Job job, String preHead, String commitRange, List<String> paths) {
        job.setPreGitSha(preHead);
        job.setCommitRange(commitRange);
        job.setAffectedPaths("[\"" + String.join("\",\"", paths) + "\"]");
        jobRepository.save(job);
    }
}
