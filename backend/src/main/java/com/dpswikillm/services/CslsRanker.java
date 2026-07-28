package com.dpswikillm.services;

import com.dpswikillm.domain.SearchResult;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Shared Cross-domain Similarity Local Scaling (CSLS) selection for every automated link-proposal
 * path (interactive discovery, health check, connection discovery). Neutralizes the anisotropy and
 * hubness of the embedding model: a candidate is accepted only when it is closer to the source than
 * both notes are to their typical neighbors.
 *
 * <pre>
 *   CSLS(A,B) = 2·cos(A,B) − r_k(A) − r_k(B)
 * </pre>
 *
 * where {@code r_k(X)} is the mean cosine of X to its k nearest neighbors (the precomputed
 * hubness). Before hubness has been backfilled the selection degrades to the coarse absolute
 * threshold so behavior is never worse than the previous raw-cosine gate.
 */
final class CslsRanker {
    private CslsRanker() {}

    /**
     * Mean cosine of the source to its {@code k} nearest neighbors, from a score-descending pool.
     * Used as a fallback for {@code r_k(A)} when the source note has no stored hubness yet.
     */
    static double meanTopK(List<SearchResult> neighborsSortedByScoreDesc, int k) {
        if (neighborsSortedByScoreDesc.isEmpty()) {
            return 0.0;
        }
        int n = Math.min(k, neighborsSortedByScoreDesc.size());
        double sum = 0;
        for (int i = 0; i < n; i += 1) {
            sum += neighborsSortedByScoreDesc.get(i).score();
        }
        return sum / n;
    }

    /**
     * Accept candidates that clear the CSLS acceptance margin, sorted by CSLS descending and
     * limited to {@code maxResults}. The absolute {@code coarseThreshold} is a pre-filter on the
     * pool only. Returns an empty list when nothing is genuinely related — never a raw top-N
     * fallback.
     *
     * <p>When {@code hubnessByPath} is empty (hubness not yet computed for the index) the selection
     * degrades to the coarse threshold so it is never stricter than the previous behavior. A single
     * candidate missing its own {@code r_k(B)} falls back to the source density, keeping its order
     * monotonic in raw cosine rather than dropping it silently.
     *
     * @param candidates neighbors of the source, excluding the source itself, sorted by cosine desc
     * @param rkA the source's neighborhood density r_k(A)
     */
    static List<SearchResult> select(
            List<SearchResult> candidates,
            double rkA,
            Map<String, Double> hubnessByPath,
            double coarseThreshold,
            double margin,
            int maxResults) {
        List<SearchResult> preFiltered =
                candidates.stream().filter(r -> r.score() >= coarseThreshold).toList();

        if (hubnessByPath.isEmpty()) {
            return preFiltered.stream()
                    .sorted(Comparator.comparingDouble(SearchResult::score).reversed())
                    .limit(maxResults)
                    .toList();
        }

        record Scored(SearchResult result, double csls) {}
        return preFiltered.stream()
                .map(
                        r -> {
                            double rkB = hubnessByPath.getOrDefault(r.path(), rkA);
                            return new Scored(r, 2 * r.score() - rkA - rkB);
                        })
                .filter(s -> s.csls() >= margin)
                .sorted(Comparator.comparingDouble(Scored::csls).reversed())
                .limit(maxResults)
                .map(Scored::result)
                .toList();
    }
}
