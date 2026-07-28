package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.dpswikillm.domain.SearchResult;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LinkDiscoveryRankingTests {

    private static final int MAX = 10;

    private static SearchResult candidate(String path, double cosine) {
        return new SearchResult(path, path, "concept", cosine, "");
    }

    @Test
    void excludesHubFalseLinkAndKeepsGenuineLink() {
        // Neighbors of muscle-hypertrophy: a genuine strength note and the 5-htp3 hub, both with
        // high raw cosine. CSLS must keep the genuine one and drop the hub.
        List<SearchResult> neighbors =
                List.of(
                        candidate("wiki/topics/progressive-overload.md", 0.90),
                        candidate("wiki/concepts/5-htp3.md", 0.85));
        double rkA = 0.86; // muscle-hypertrophy neighborhood density
        Map<String, Double> hubness =
                Map.of(
                        "wiki/topics/progressive-overload.md", 0.84, // specific -> lower density
                        "wiki/concepts/5-htp3.md", 0.90); // hub -> high density

        List<SearchResult> result = CslsRanker.select(neighbors, rkA, hubness, 0.72, 0.03, MAX);

        assertThat(result)
                .extracting(SearchResult::path)
                .containsExactly("wiki/topics/progressive-overload.md");
    }

    @Test
    void returnsEmptyWhenNothingClearsMargin() {
        List<SearchResult> neighbors = List.of(candidate("wiki/concepts/5-htp3.md", 0.85));
        Map<String, Double> hubness = Map.of("wiki/concepts/5-htp3.md", 0.88);

        assertThat(CslsRanker.select(neighbors, 0.86, hubness, 0.72, 0.05, MAX)).isEmpty();
    }

    @Test
    void coarseThresholdPreFiltersFarCandidates() {
        List<SearchResult> neighbors = List.of(candidate("wiki/concepts/far.md", 0.70));
        Map<String, Double> hubness = Map.of("wiki/concepts/other.md", 0.85);

        assertThat(CslsRanker.select(neighbors, 0.80, hubness, 0.72, -1.0, MAX)).isEmpty();
    }

    @Test
    void missingCandidateHubnessFallsBackToSourceDensity() {
        // Hubness exists for the index but not for these candidates -> rkB = rkA (monotonic in
        // cos):
        // a strongly-similar candidate survives, a weak one is dropped by the margin.
        Map<String, Double> hubness = Map.of("wiki/concepts/other.md", 0.85);
        List<SearchResult> strong = List.of(candidate("wiki/concepts/strong.md", 0.95));
        List<SearchResult> weak = List.of(candidate("wiki/concepts/weak.md", 0.81));

        assertThat(CslsRanker.select(strong, 0.80, hubness, 0.72, 0.05, MAX))
                .extracting(SearchResult::path)
                .containsExactly("wiki/concepts/strong.md");
        assertThat(CslsRanker.select(weak, 0.80, hubness, 0.72, 0.05, MAX)).isEmpty();
    }

    @Test
    void emptyHubnessDegradesToCoarseThreshold() {
        // Before hubness is backfilled: no CSLS, just the coarse absolute threshold — never
        // stricter
        // than the previous raw-cosine gate.
        List<SearchResult> neighbors =
                List.of(
                        candidate("wiki/concepts/strong.md", 0.95),
                        candidate("wiki/concepts/weak.md", 0.81));

        assertThat(CslsRanker.select(neighbors, 0.80, Map.of(), 0.72, 0.05, MAX))
                .extracting(SearchResult::path)
                .containsExactly("wiki/concepts/strong.md", "wiki/concepts/weak.md");
    }

    @Test
    void meanTopKAveragesHighestScores() {
        List<SearchResult> neighbors =
                List.of(candidate("a", 0.90), candidate("b", 0.80), candidate("c", 0.70));

        assertThat(CslsRanker.meanTopK(neighbors, 2)).isCloseTo(0.85, within(1e-9));
        assertThat(CslsRanker.meanTopK(neighbors, 10)).isCloseTo(0.80, within(1e-9));
        assertThat(CslsRanker.meanTopK(List.of(), 5)).isZero();
    }
}
