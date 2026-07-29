package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.dto.HealthCheckProgress;
import com.dpswikillm.repositories.AppSettingRepository;
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
    // Retrieve a broad pool by raw cosine, then let CSLS re-rank it and keep only the top few. The
    // pool must be well above the kept limit; otherwise a genuine neighbor that the model's
    // anisotropy pushes past rank-N is dropped before CSLS ever scores it.
    private static final int SEMANTIC_POOL = 40;
    private static final int SEMANTIC_LIMIT = 10;
    private static final String TOPIC_DOC_TYPE = "topic";
    private static final double TOPIC_THRESHOLD = 0.72;
    private static final int TOPIC_POOL = 15;
    private static final int TOPIC_LIMIT = 5;
    public static final String IDEMPOTENCY_LEDGER = "state/runtime/idempotency-keys.json";

    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final SemanticSearchService semanticSearchService;
    private final MarkdownService markdownService;
    private final MutationApplier mutationApplier;
    private final SnapshotService snapshotService;
    private final DocumentIndexRepository repository;
    private final AppProperties properties;
    private final AppSettingRepository settingRepository;

    public HealthCheckService(
            ReindexService reindexService,
            EmbeddingIndexService embeddingIndexService,
            SemanticSearchService semanticSearchService,
            MarkdownService markdownService,
            MutationApplier mutationApplier,
            SnapshotService snapshotService,
            DocumentIndexRepository repository,
            AppProperties properties,
            AppSettingRepository settingRepository) {
        this.reindexService = reindexService;
        this.embeddingIndexService = embeddingIndexService;
        this.semanticSearchService = semanticSearchService;
        this.markdownService = markdownService;
        this.mutationApplier = mutationApplier;
        this.snapshotService = snapshotService;
        this.repository = repository;
        this.properties = properties;
        this.settingRepository = settingRepository;
    }

    /** Result of the discovery phases (1 + 2) before connections are written to disk. */
    public record DiscoverResult(
            int embeddingsBuilt,
            int connectionsFound,
            Map<String, LinkedHashSet<String>> computed,
            Set<String> backlinkOnlyPaths) {}

    /**
     * Runs phases 1 (embeddings) and 2 (connection discovery) but does NOT write anything to disk.
     * The caller is responsible for creating a snapshot, applying the returned computed map via
     * {@link #applyConnections}, and finalizing the snapshot.
     */
    public DiscoverResult discover(Set<String> pathFilter, Consumer<HealthCheckProgress> onProgress)
            throws IOException {
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

        List<DocumentRecord> all = repository.findAllDocuments();
        List<DocumentRecord> sources =
                all.stream()
                        .filter(doc -> doc.path().startsWith("wiki/"))
                        .filter(doc -> pathFilter.isEmpty() || pathFilter.contains(doc.path()))
                        .sorted(Comparator.comparing(DocumentRecord::path))
                        .toList();
        int total = sources.size();

        // Phase 1 just backfilled hubness for the whole index, so CSLS is active here. Computed
        // once
        // for the whole run.
        Map<String, Double> hubnessByPath =
                repository.findHubnessByPath(properties.embeddings().model());
        int hubnessK = LinkRankingSettings.hubnessK(settingRepository);
        double margin = LinkRankingSettings.cslsMargin(settingRepository);

        Map<String, LinkedHashSet<String>> computed = new LinkedHashMap<>();
        Map<String, Set<String>> knownLinks = new HashMap<>();
        Set<String> countedPairs = new HashSet<>();
        int connectionsFound = 0;
        int processed = 0;

        for (DocumentRecord source : sources) {
            String sourcePath = source.path();
            String query = buildQuery(source);

            List<SearchResult> generalNeighbors =
                    semanticSearchService.search(query, SEMANTIC_POOL).stream()
                            .filter(r -> !r.path().equals(sourcePath))
                            .toList();
            Double storedRkA = hubnessByPath.get(sourcePath);
            double rkA =
                    storedRkA != null ? storedRkA : CslsRanker.meanTopK(generalNeighbors, hubnessK);

            LinkedHashSet<String> candidates = new LinkedHashSet<>();
            for (SearchResult r :
                    CslsRanker.select(
                            generalNeighbors,
                            rkA,
                            hubnessByPath,
                            SEMANTIC_THRESHOLD,
                            margin,
                            SEMANTIC_LIMIT)) {
                candidates.add(r.path());
            }
            List<SearchResult> topicNeighbors =
                    semanticSearchService.searchByType(query, TOPIC_DOC_TYPE, TOPIC_POOL).stream()
                            .filter(r -> !r.path().equals(sourcePath))
                            .toList();
            for (SearchResult r :
                    CslsRanker.select(
                            topicNeighbors,
                            rkA,
                            hubnessByPath,
                            TOPIC_THRESHOLD,
                            margin,
                            TOPIC_LIMIT)) {
                candidates.add(r.path());
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

        Set<String> backlinkOnlyPaths = new HashSet<>();
        if (!pathFilter.isEmpty()) {
            for (String path : computed.keySet()) {
                if (!pathFilter.contains(path)) {
                    backlinkOnlyPaths.add(path);
                }
            }
        }

        return new DiscoverResult(embeddingsBuilt, connectionsFound, computed, backlinkOnlyPaths);
    }

    /**
     * Applies the computed connection map to the vault within the provided snapshot. Captures
     * before-state, applies mutations, and records after-state, but does NOT finalize the snapshot
     * (the caller must call {@code snapshotService.finalizeSnapshot(snapshot, job)}).
     *
     * @return the mutation result so the caller can invoke {@code recordAfter} on affected paths
     */
    public MutationResult applyConnections(
            Map<String, LinkedHashSet<String>> computed,
            Set<String> backlinkOnlyPaths,
            Snapshot snapshot)
            throws IOException {
        for (String path : computed.keySet()) {
            snapshotService.captureFile(snapshot, path);
        }
        snapshotService.captureFile(snapshot, IDEMPOTENCY_LEDGER);

        List<MutationAction> actions = new ArrayList<>();
        for (Map.Entry<String, LinkedHashSet<String>> entry : computed.entrySet()) {
            String path = entry.getKey();
            List<String> links = new ArrayList<>(entry.getValue());
            String idempotencyKey = "health-check:" + snapshot.getId() + ":" + path;
            MutationAction action;
            if (backlinkOnlyPaths.contains(path)) {
                // Append-only: preserve existing Related content, add missing links
                action =
                        new MutationAction(
                                MutationActionType.update,
                                path,
                                null,
                                Map.of(),
                                Map.of("Related", links),
                                idempotencyKey,
                                null);
            } else {
                // Replace: fully overwrite Related section with the computed set
                action =
                        new MutationAction(
                                MutationActionType.update,
                                path,
                                null,
                                Map.of(),
                                null,
                                idempotencyKey,
                                Map.of("Related", links));
            }
            actions.add(action);
        }
        return mutationApplier.apply(new MutationPlan("health-check-" + snapshot.getId(), actions));
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
