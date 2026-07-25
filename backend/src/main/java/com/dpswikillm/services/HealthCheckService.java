package com.dpswikillm.services;

import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.dto.HealthCheckProgress;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Manual vault reconciliation launched from Settings. Runs the same connection-discovery logic as
 * the ingest pipeline, but over the whole vault:
 *
 * <ol>
 *   <li><b>Phase 1 (embeddings):</b> reindex the wiki and embed every note under {@code
 *       wiki/topics}, {@code wiki/concepts} and {@code wiki/sources} that is missing an embedding
 *       (delegated to {@link EmbeddingIndexService#embedIncremental}).
 *   <li><b>Phase 2 (connections):</b> for each note under {@code wiki/}, find semantic neighbours
 *       (general search plus a dedicated {@code topic} search) and materialize the new links
 *       bidirectionally in the {@code Related} section of both notes, replacing the section on
 *       every run so results are idempotent.
 * </ol>
 *
 * Phase-2 writes are wrapped in a revertible {@link Snapshot} with {@code source = "HEALTH_CHECK"}.
 */
@Service
public class HealthCheckService {
    private static final Logger log = LoggerFactory.getLogger(HealthCheckService.class);

    private static final double SEMANTIC_THRESHOLD = 0.72;
    private static final int SEMANTIC_LIMIT = 8;
    private static final String TOPIC_DOC_TYPE = "topic";
    private static final double TOPIC_THRESHOLD = 0.72;
    private static final int TOPIC_LIMIT = 3;
    private static final String IDEMPOTENCY_LEDGER = "state/runtime/idempotency-keys.json";

    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final SemanticSearchService semanticSearchService;
    private final MarkdownService markdownService;
    private final MutationApplier mutationApplier;
    private final SnapshotService snapshotService;
    private final DocumentIndexRepository repository;

    public HealthCheckService(
            ReindexService reindexService,
            EmbeddingIndexService embeddingIndexService,
            SemanticSearchService semanticSearchService,
            MarkdownService markdownService,
            MutationApplier mutationApplier,
            SnapshotService snapshotService,
            DocumentIndexRepository repository) {
        this.reindexService = reindexService;
        this.embeddingIndexService = embeddingIndexService;
        this.semanticSearchService = semanticSearchService;
        this.markdownService = markdownService;
        this.mutationApplier = mutationApplier;
        this.snapshotService = snapshotService;
        this.repository = repository;
    }

    public HealthCheckProgress run() throws IOException {
        return run(progress -> {});
    }

    public HealthCheckProgress run(Consumer<HealthCheckProgress> onProgress) throws IOException {
        return run(Set.of(), onProgress);
    }

    /**
     * Runs the health check with phase 2 restricted to the given paths. An empty set means "all
     * notes" (same as the full health check). Phase 1 (embeddings) always runs over the whole
     * vault.
     */
    public HealthCheckProgress run(Set<String> pathFilter, Consumer<HealthCheckProgress> onProgress)
            throws IOException {
        // Phase 1: reindex (pick up manual edits) then embed anything missing/changed.
        reindexService.reindexWiki();
        EmbeddingIndexService.EmbedIndexResult embedResult =
                embeddingIndexService.embedIncremental(
                        p ->
                                onProgress.accept(
                                        new HealthCheckProgress(
                                                "embeddings",
                                                p.processed(),
                                                p.total(),
                                                p.processed(),
                                                0)));
        int embeddingsBuilt = embedResult.embeddedDocuments();
        onProgress.accept(
                new HealthCheckProgress(
                        "embeddings", embeddingsBuilt, embeddingsBuilt, embeddingsBuilt, 0));

        // Phase 2: discover and materialize new connections between concepts/sources notes.
        int connectionsFound = discoverConnections(embeddingsBuilt, pathFilter, onProgress);

        return new HealthCheckProgress("done", 0, 0, embeddingsBuilt, connectionsFound);
    }

    private int discoverConnections(
            int embeddingsBuilt, Set<String> pathFilter, Consumer<HealthCheckProgress> onProgress)
            throws IOException {
        List<DocumentRecord> all = repository.findAllDocuments();
        List<DocumentRecord> sources =
                all.stream()
                        .filter(doc -> doc.path().startsWith("wiki/"))
                        .filter(doc -> pathFilter.isEmpty() || pathFilter.contains(doc.path()))
                        .sorted(Comparator.comparing(DocumentRecord::path))
                        .toList();
        int total = sources.size();

        // computed: the FULL desired Related content per note for this run (replace, not append).
        // knownLinks: tracks which links have already been added to a note's computed set in this
        // run, ensuring no within-run duplicates regardless of how many search paths produce the
        // same candidate.
        // countedPairs: ensures each pair is counted and processed once even when both notes are
        // in sources and the pair would be encountered from each side.
        Map<String, LinkedHashSet<String>> computed = new LinkedHashMap<>();
        Map<String, Set<String>> knownLinks = new HashMap<>();
        Set<String> countedPairs = new HashSet<>();
        int connectionsFound = 0;
        int processed = 0;

        for (DocumentRecord source : sources) {
            String sourcePath = source.path();
            String query = buildQuery(source);

            LinkedHashSet<String> candidates = new LinkedHashSet<>();
            for (SearchResult r : semanticSearchService.search(query, SEMANTIC_LIMIT)) {
                if (r.score() >= SEMANTIC_THRESHOLD && !r.path().equals(sourcePath)) {
                    candidates.add(r.path());
                }
            }
            for (SearchResult r :
                    semanticSearchService.searchByType(query, TOPIC_DOC_TYPE, TOPIC_LIMIT)) {
                if (r.score() >= TOPIC_THRESHOLD && !r.path().equals(sourcePath)) {
                    candidates.add(r.path());
                }
            }

            for (String targetPath : candidates) {
                String pairKey = canonicalPair(sourcePath, targetPath);
                if (countedPairs.contains(pairKey)) {
                    continue;
                }
                Set<String> sourceKnown =
                        knownLinks.computeIfAbsent(sourcePath, k -> new HashSet<>());
                Set<String> targetKnown =
                        knownLinks.computeIfAbsent(targetPath, k -> new HashSet<>());
                if (!sourceKnown.contains(linkKey(targetPath))) {
                    computed.computeIfAbsent(sourcePath, k -> new LinkedHashSet<>())
                            .add("[[" + targetPath + "]]");
                    sourceKnown.add(linkKey(targetPath));
                }
                if (!targetKnown.contains(linkKey(sourcePath))) {
                    computed.computeIfAbsent(targetPath, k -> new LinkedHashSet<>())
                            .add("[[" + sourcePath + "]]");
                    targetKnown.add(linkKey(sourcePath));
                }
                countedPairs.add(pairKey);
                connectionsFound += 1;
            }

            processed += 1;
            onProgress.accept(
                    new HealthCheckProgress(
                            "connections", processed, total, embeddingsBuilt, connectionsFound));
        }
        if (total == 0) {
            onProgress.accept(
                    new HealthCheckProgress(
                            "connections", 0, 0, embeddingsBuilt, connectionsFound));
        }

        if (!computed.isEmpty()) {
            applyComputed(computed);
        }
        return connectionsFound;
    }

    /**
     * Replaces the Related section of each note with the fully computed set of links for this run.
     * Using sectionReplacements (not sections/merge) ensures old auto-links are overwritten rather
     * than accumulated.
     */
    private void applyComputed(Map<String, LinkedHashSet<String>> computed) throws IOException {
        Snapshot snapshot =
                snapshotService.beginSnapshot(
                        UUID.randomUUID().toString(),
                        "health-check",
                        "Health Check",
                        "HEALTH_CHECK");
        try {
            for (String path : computed.keySet()) {
                snapshotService.captureFile(snapshot, path);
            }
            snapshotService.captureFile(snapshot, IDEMPOTENCY_LEDGER);

            List<MutationAction> actions = new ArrayList<>();
            for (Map.Entry<String, LinkedHashSet<String>> entry : computed.entrySet()) {
                actions.add(
                        new MutationAction(
                                MutationActionType.update,
                                entry.getKey(),
                                null,
                                Map.of(),
                                null,
                                "health-check:" + snapshot.getId() + ":" + entry.getKey(),
                                Map.of("Related", new ArrayList<>(entry.getValue()))));
            }
            MutationResult result =
                    mutationApplier.apply(
                            new MutationPlan("health-check-" + snapshot.getId(), actions));

            for (String path : result.created()) {
                snapshotService.recordAfter(snapshot, path);
            }
            for (String path : result.updated()) {
                snapshotService.recordAfter(snapshot, path);
            }
            snapshotService.recordAfter(snapshot, IDEMPOTENCY_LEDGER);
            snapshotService.finalizeSnapshot(snapshot, null);
        } catch (IOException | RuntimeException ex) {
            // Leave no dangling snapshot behind on failure.
            try {
                snapshotService.deleteSnapshot(snapshot.getId());
            } catch (RuntimeException cleanupEx) {
                log.warn(
                        "Failed to clean up health-check snapshot {}: {}",
                        snapshot.getId(),
                        cleanupEx.getMessage());
            }
            throw ex;
        }
    }

    private String buildQuery(DocumentRecord doc) {
        Object raw = markdownService.parse(doc.body()).frontmatter().get("keywords");
        if (raw instanceof List<?> keywords && !keywords.isEmpty()) {
            return keywords.stream().map(Object::toString).collect(Collectors.joining(" "));
        }
        return doc.title();
    }

    /** Normalizes a wikilink target (dropping any {@code |alias}) to a case-insensitive key. */
    private static String linkKey(String target) {
        String value = target == null ? "" : target;
        int pipe = value.indexOf('|');
        if (pipe >= 0) {
            value = value.substring(0, pipe);
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    /** Order-insensitive key for a pair of notes so a connection is counted once. */
    private static String canonicalPair(String a, String b) {
        String ka = linkKey(a);
        String kb = linkKey(b);
        return ka.compareTo(kb) <= 0 ? ka + " " + kb : kb + " " + ka;
    }
}
