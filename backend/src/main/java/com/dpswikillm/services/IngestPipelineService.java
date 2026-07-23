package com.dpswikillm.services;

import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.domain.GuardrailResult;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.dto.ConceptResolutionResult;
import com.dpswikillm.repositories.JobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IngestPipelineService {
    private static final Logger log = LoggerFactory.getLogger(IngestPipelineService.class);
    private final SourceNormalizer sourceNormalizer;
    private final SourceNoteLlmService sourceNoteLlmService;
    private final SourceNotePlanner sourceNotePlanner;
    private final LlmMutationPlanService llmMutationPlanService;
    private final MutationGuardrailService guardrailService;
    private final MutationApplier mutationApplier;
    private final RootIndexService rootIndexService;
    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final SnapshotService snapshotService;
    private final VaultPathResolver pathResolver;
    private final JobLifecycleService lifecycleService;
    private final JobRepository jobRepository;
    private final ConnectionDiscoveryService connectionDiscoveryService;
    private final GuidedReviewService guidedReviewService;
    private final ConceptResolutionService conceptResolutionService;
    private final ObjectMapper objectMapper;

    public IngestPipelineService(
            SourceNormalizer sourceNormalizer,
            SourceNoteLlmService sourceNoteLlmService,
            SourceNotePlanner sourceNotePlanner,
            LlmMutationPlanService llmMutationPlanService,
            MutationGuardrailService guardrailService,
            MutationApplier mutationApplier,
            RootIndexService rootIndexService,
            ReindexService reindexService,
            EmbeddingIndexService embeddingIndexService,
            SnapshotService snapshotService,
            VaultPathResolver pathResolver,
            JobLifecycleService lifecycleService,
            JobRepository jobRepository,
            ConnectionDiscoveryService connectionDiscoveryService,
            GuidedReviewService guidedReviewService,
            ConceptResolutionService conceptResolutionService,
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
        this.snapshotService = snapshotService;
        this.pathResolver = pathResolver;
        this.lifecycleService = lifecycleService;
        this.jobRepository = jobRepository;
        this.connectionDiscoveryService = connectionDiscoveryService;
        this.guidedReviewService = guidedReviewService;
        this.conceptResolutionService = conceptResolutionService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void run(Job job) throws Exception {
        Path ledger = pathResolver.resolve("state/runtime/idempotency-keys.json");
        String ledgerSnapshot =
                Files.exists(ledger) ? Files.readString(ledger, StandardCharsets.UTF_8) : null;

        Snapshot snapshot = snapshotService.beginSnapshot(job.getId().toString(), "ingest", null);
        PipelineTx tx = new PipelineTx();
        tx.onRollback("restore-idempotency-ledger", () -> restoreLedger(ledger, ledgerSnapshot));
        tx.onRollback("delete-snapshot", () -> snapshotService.deleteSnapshot(snapshot.getId()));
        tx.onRollback("restore-vault-files", () -> snapshotService.hardReset(snapshot.getId()));

        try {
            lifecycleService.transition(
                    job.getId(), JobStatus.PROGRESS, "normalization", "Normalizing raw artifact");
            NormalizedSourcePayload payload = sourceNormalizer.normalize(job.getPayloadRef());
            snapshotService.captureFileAsNew(snapshot, payload.rawPath());
            lifecycleService.fileEvent(job, payload.rawPath(), "read");

            lifecycleService.transition(
                    job.getId(),
                    JobStatus.PROGRESS,
                    "llm-cleaning",
                    "Cleaning source note with LLM");
            payload = payload.withSourceNote(sourceNoteLlmService.clean(payload));

            lifecycleService.transition(
                    job.getId(),
                    JobStatus.PROGRESS,
                    "baseline-apply",
                    "Applying baseline source note");
            MutationPlan baseline = sourceNotePlanner.baselinePlan(payload);
            String sourceNotePath = sourceNotePlanner.sourceNotePath(payload);

            capturePathsInPlan(snapshot, baseline);
            snapshotService.captureFile(snapshot, "INDEX.md");
            snapshotService.captureFile(snapshot, "state/runtime/idempotency-keys.json");

            MutationResult baselineResult = mutationApplier.apply(baseline);
            boolean indexUpdated = rootIndexService.addEntry(payload.title(), sourceNotePath);
            lifecycleService.fileEvent(
                    job, sourceNotePath, baselineResult.created().isEmpty() ? "update" : "create");
            lifecycleService.fileEvent(job, "INDEX.md", indexUpdated ? "update" : "read");

            for (String p : baselineResult.created()) snapshotService.recordAfter(snapshot, p);
            for (String p : baselineResult.updated()) snapshotService.recordAfter(snapshot, p);
            snapshotService.recordAfter(snapshot, "INDEX.md");
            snapshotService.recordAfter(snapshot, "state/runtime/idempotency-keys.json");

            lifecycleService.transition(
                    job.getId(), JobStatus.PROGRESS, "reindex", "Reindexing wiki documents");
            reindexService.reindexWiki();
            lifecycleService.transition(
                    job.getId(), JobStatus.PROGRESS, "embedding", "Generating embeddings");
            embeddingIndexService.embedIncremental(embeddingProgress(job));

            lifecycleService.transition(
                    job.getId(),
                    JobStatus.PROGRESS,
                    "connection-discovery",
                    "Requesting optional connection plan");
            MutationPlan llmPlan = requestOptionalPlan(payload, sourceNotePath);
            log.info(
                    "Job {}: LLM plan has {} action(s)",
                    job.getId(),
                    llmPlan.pageActions() == null ? 0 : llmPlan.pageActions().size());
            if (llmPlan.pageActions() != null) {
                for (var a : llmPlan.pageActions()) {
                    log.info("  LLM action: {} {}", a.action(), a.path());
                }
            }
            GuardrailResult guarded =
                    guardrailService.guardrail(llmPlan, payload.rawPath(), sourceNotePath);
            if (!guarded.rejections().isEmpty()) {
                log.info(
                        "Job {}: guardrail rejected {} action(s): {}",
                        job.getId(),
                        guarded.rejections().size(),
                        guarded.rejections());
            }
            lifecycleService.transition(
                    job.getId(),
                    JobStatus.PROGRESS,
                    "concept-resolution",
                    "Resolving concept duplicates");
            ConceptResolutionResult conceptResult =
                    conceptResolutionService.resolve(guarded.plan());
            lifecycleService.conceptProposals(job, conceptResult.proposals());

            // Apply new concept pages (creates that weren't deduplicated to an existing concept)
            List<MutationAction> newConceptActions =
                    conceptResult.plan().pageActions() == null
                            ? List.of()
                            : conceptResult.plan().pageActions().stream()
                                    .filter(
                                            a ->
                                                    a.action() == MutationActionType.create
                                                            && a.path() != null
                                                            && a.path()
                                                                    .startsWith("wiki/concepts/"))
                                    .toList();
            List<String> createdConceptPaths = new ArrayList<>();
            if (!newConceptActions.isEmpty()) {
                for (var a : newConceptActions) snapshotService.captureFile(snapshot, a.path());
                MutationResult conceptCreateResult =
                        mutationApplier.apply(
                                new MutationPlan(
                                        "concept-creates-" + job.getId(), newConceptActions));
                for (String p : conceptCreateResult.created()) {
                    snapshotService.recordAfter(snapshot, p);
                    lifecycleService.fileEvent(job, p, "create");
                    createdConceptPaths.add(p);
                }
                for (String p : conceptCreateResult.updated()) {
                    snapshotService.recordAfter(snapshot, p);
                    lifecycleService.fileEvent(job, p, "update");
                    createdConceptPaths.add(p);
                }
                if (!createdConceptPaths.isEmpty()) {
                    snapshotService.recordAfter(snapshot, "state/runtime/idempotency-keys.json");
                }
            }

            var candidates =
                    connectionDiscoveryService.discoverAndPersist(
                            job, payload, sourceNotePath, conceptResult.plan());

            if (job.getMode() == JobMode.validated) {
                snapshotService.recordAfter(snapshot, payload.rawPath());
                List<String> baselinePaths =
                        new ArrayList<>(
                                List.of(
                                        sourceNotePath,
                                        "INDEX.md",
                                        "state/runtime/idempotency-keys.json",
                                        payload.rawPath()));
                baselinePaths.addAll(createdConceptPaths);
                job.setAffectedPaths(toJson(baselinePaths));
                job.setSnapshotId(snapshot.getId());
                jobRepository.save(job);
                lifecycleService.transition(
                        job.getId(),
                        JobStatus.AWAITING_REVIEW,
                        "awaiting-review",
                        "Baseline applied; connection application deferred to guided review");
                lifecycleService.awaitingReview(
                        job,
                        "Connection candidates ready for review",
                        objectMapper.writeValueAsString(candidates));
                tx.clear();
                return;
            }

            MutationResult connectionsResult = MutationResult.empty("no-connections");
            if (!candidates.isEmpty()) {
                candidates.forEach(
                        candidate -> candidate.setDecision(ConnectionCandidateDecision.accepted));
                for (var candidate : candidates) {
                    snapshotService.captureFile(snapshot, candidate.getTargetPath());
                }
                // applyAccepted now writes both directions (backlink into targets + reverse link
                // into the source note) and reindexes/embeds internally, so no separate
                // forward-link
                // pass is needed here.
                connectionsResult =
                        guidedReviewService.applyAccepted(
                                job, candidates, "unattended-connections-" + job.getId(), false);
                for (String p : connectionsResult.created())
                    snapshotService.recordAfter(snapshot, p);
                for (String p : connectionsResult.updated())
                    snapshotService.recordAfter(snapshot, p);
                snapshotService.recordAfter(snapshot, "state/runtime/idempotency-keys.json");
                snapshotService.recordAfter(snapshot, sourceNotePath);
            }

            snapshotService.recordAfter(snapshot, payload.rawPath());

            List<String> allPaths = new ArrayList<>(List.of(sourceNotePath, "INDEX.md"));
            allPaths.addAll(createdConceptPaths);
            allPaths.addAll(connectionsResult.created());
            allPaths.addAll(connectionsResult.updated());
            allPaths.add("state/runtime/idempotency-keys.json");
            allPaths.add(payload.rawPath());
            int connectionCount =
                    connectionsResult.created().size() + connectionsResult.updated().size();
            String commitMessage =
                    connectionCount > 0
                            ? "Ingest: "
                                    + payload.title()
                                    + " (+"
                                    + connectionCount
                                    + " connections)"
                            : "Ingest: " + payload.title();

            snapshot.setMessage(commitMessage);
            snapshotService.finalizeSnapshot(snapshot, job);
            job.setAffectedPaths(toJson(allPaths));
            jobRepository.save(job);

            lifecycleService.transition(
                    job.getId(), JobStatus.COMPLETED, "completed", "Ingest completed");
            tx.clear();
        } catch (Exception ex) {
            tx.rollback();
            lifecycleService.transition(job.getId(), JobStatus.FAILED, "failed", ex.getMessage());
            throw ex;
        }
    }

    /**
     * Emit an {@code embedding-scan} progress event per batch so the UI can show a live percentage
     * while the (slow) embedding phase runs.
     */
    private java.util.function.Consumer<EmbeddingIndexService.EmbedProgress> embeddingProgress(
            Job job) {
        return p ->
                lifecycleService.progress(
                        job,
                        "embedding-scan",
                        "embeddings",
                        "{\"current\":" + p.processed() + ",\"total\":" + p.total() + "}");
    }

    private void capturePathsInPlan(Snapshot snapshot, MutationPlan plan) throws IOException {
        for (var action : plan.pageActions()) {
            if (action.path() != null && !action.path().isBlank()) {
                snapshotService.captureFile(snapshot, action.path());
            }
        }
    }

    private MutationPlan requestOptionalPlan(
            NormalizedSourcePayload payload, String sourceNotePath) {
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

    private String toJson(List<String> paths) {
        try {
            return objectMapper.writeValueAsString(paths);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to serialize affected paths", ex);
        }
    }
}
