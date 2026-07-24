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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
 *   <li><b>Phase 2 (connections):</b> for each note under {@code wiki/concepts} and {@code
 *       wiki/sources}, find semantic neighbours (general search plus a dedicated {@code topic}
 *       search) and materialize the new links bidirectionally in the {@code Related} section of
 *       both notes, deduping against existing links.
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
    private static final Pattern WIKILINK = Pattern.compile("\\[\\[([^\\]]+)\\]\\]");

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
        Map<String, DocumentRecord> byPath = new HashMap<>();
        for (DocumentRecord doc : all) {
            byPath.put(doc.path(), doc);
        }
        List<DocumentRecord> sources =
                all.stream()
                        .filter(
                                doc ->
                                        doc.path().startsWith("wiki/concepts/")
                                                || doc.path().startsWith("wiki/sources/"))
                        .filter(doc -> pathFilter.isEmpty() || pathFilter.contains(doc.path()))
                        .sorted(Comparator.comparing(DocumentRecord::path))
                        .toList();
        int total = sources.size();

        // Per-note Related additions (literal "[[path]]") and the set of link keys already known
        // for a
        // note (existing links plus ones we have decided to add), so we never add duplicates.
        Map<String, LinkedHashSet<String>> additions = new LinkedHashMap<>();
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
                        knownLinks.computeIfAbsent(sourcePath, k -> existingLinks(byPath.get(k)));
                Set<String> targetKnown =
                        knownLinks.computeIfAbsent(targetPath, k -> existingLinks(byPath.get(k)));
                boolean forwardMissing = !sourceKnown.contains(linkKey(targetPath));
                boolean backMissing = !targetKnown.contains(linkKey(sourcePath));
                if (!forwardMissing && !backMissing) {
                    continue; // already fully linked in both directions
                }
                if (forwardMissing) {
                    additions
                            .computeIfAbsent(sourcePath, k -> new LinkedHashSet<>())
                            .add("[[" + targetPath + "]]");
                    sourceKnown.add(linkKey(targetPath));
                }
                if (backMissing) {
                    additions
                            .computeIfAbsent(targetPath, k -> new LinkedHashSet<>())
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

        if (!additions.isEmpty()) {
            applyAdditions(additions);
        }
        return connectionsFound;
    }

    /** Applies the accumulated Related additions in a single revertible HEALTH_CHECK snapshot. */
    private void applyAdditions(Map<String, LinkedHashSet<String>> additions) throws IOException {
        Snapshot snapshot =
                snapshotService.beginSnapshot(
                        UUID.randomUUID().toString(),
                        "health-check",
                        "Health Check",
                        "HEALTH_CHECK");
        try {
            for (String path : additions.keySet()) {
                snapshotService.captureFile(snapshot, path);
            }
            snapshotService.captureFile(snapshot, IDEMPOTENCY_LEDGER);

            List<MutationAction> actions = new ArrayList<>();
            for (Map.Entry<String, LinkedHashSet<String>> entry : additions.entrySet()) {
                actions.add(
                        new MutationAction(
                                MutationActionType.update,
                                entry.getKey(),
                                null,
                                Map.of(),
                                Map.of("Related", new ArrayList<>(entry.getValue())),
                                "health-check:" + snapshot.getId() + ":" + entry.getKey()));
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

    private Set<String> existingLinks(DocumentRecord doc) {
        Set<String> links = new HashSet<>();
        if (doc == null) {
            return links;
        }
        String related = markdownService.parse(doc.body()).sections().get("Related");
        if (related == null || related.isBlank()) {
            return links;
        }
        Matcher matcher = WIKILINK.matcher(related);
        while (matcher.find()) {
            links.add(linkKey(matcher.group(1)));
        }
        return links;
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
