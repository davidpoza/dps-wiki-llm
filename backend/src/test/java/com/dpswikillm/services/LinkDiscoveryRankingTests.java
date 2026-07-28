package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.services.LinkDiscoveryService.DiscoveredLink;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LinkDiscoveryRankingTests {

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

        List<DiscoveredLink> result =
                LinkDiscoveryService.selectByCsls(neighbors, rkA, hubness, 0.72, 0.03);

        assertThat(result)
                .extracting(DiscoveredLink::path)
                .containsExactly("wiki/topics/progressive-overload.md");
    }

    @Test
    void returnsEmptyWhenNothingClearsMargin() {
        List<SearchResult> neighbors = List.of(candidate("wiki/concepts/5-htp3.md", 0.85));
        Map<String, Double> hubness = Map.of("wiki/concepts/5-htp3.md", 0.88);

        assertThat(LinkDiscoveryService.selectByCsls(neighbors, 0.86, hubness, 0.72, 0.05))
                .isEmpty();
    }

    @Test
    void coarseThresholdPreFiltersFarCandidates() {
        List<SearchResult> neighbors = List.of(candidate("wiki/concepts/far.md", 0.70));

        assertThat(LinkDiscoveryService.selectByCsls(neighbors, 0.60, Map.of(), 0.72, -1.0))
                .isEmpty();
    }

    @Test
    void missingHubnessFallsBackToRawCosineRankingNotDropped() {
        // No stored r_k(B): a strongly-similar candidate survives, a weak one is dropped by margin.
        List<SearchResult> strong = List.of(candidate("wiki/concepts/strong.md", 0.95));
        List<SearchResult> weak = List.of(candidate("wiki/concepts/weak.md", 0.81));

        assertThat(LinkDiscoveryService.selectByCsls(strong, 0.80, Map.of(), 0.72, 0.05))
                .extracting(DiscoveredLink::path)
                .containsExactly("wiki/concepts/strong.md");
        assertThat(LinkDiscoveryService.selectByCsls(weak, 0.80, Map.of(), 0.72, 0.05)).isEmpty();
    }

    @Test
    void meanTopKAveragesHighestScores() {
        List<SearchResult> neighbors =
                List.of(candidate("a", 0.90), candidate("b", 0.80), candidate("c", 0.70));

        assertThat(LinkDiscoveryService.meanTopK(neighbors, 2)).isCloseTo(0.85, within(1e-9));
        assertThat(LinkDiscoveryService.meanTopK(neighbors, 10)).isCloseTo(0.80, within(1e-9));
        assertThat(LinkDiscoveryService.meanTopK(List.of(), 5)).isZero();
    }
}
