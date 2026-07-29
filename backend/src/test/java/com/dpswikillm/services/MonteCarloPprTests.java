package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;

class MonteCarloPprTests {

    private static final MonteCarloPpr.Params PARAMS = new MonteCarloPpr.Params(2000, 30, 0.15);

    @Test
    void multiHopNeighborSurfaces() {
        // A -- B -- C. Seeded at A, C is two hops away and in no seed, yet must accrue visits.
        Map<String, List<String>> adjacency =
                Map.of(
                        "a", List.of("b"),
                        "b", List.of("a", "c"),
                        "c", List.of("b"));

        Map<String, Double> ranked =
                MonteCarloPpr.rank(adjacency, Map.of("a", 1.0), PARAMS, new Random(42));

        assertThat(ranked).containsKey("c");
        assertThat(ranked.get("c")).isGreaterThan(0.0);
    }

    @Test
    void rankingDecreasesWithGraphDistanceFromSeed() {
        // Seeded at A over the chain A--B--C: the 2-hop node C is the farthest from the seed
        // neighborhood and must score below both the seed A and its direct neighbor B. (B is a
        // degree-2 hub A funnels into, so B may outrank A — closeness, not the seed itself, wins.)
        Map<String, List<String>> adjacency =
                Map.of(
                        "a", List.of("b"),
                        "b", List.of("a", "c"),
                        "c", List.of("b"));

        Map<String, Double> ranked =
                MonteCarloPpr.rank(adjacency, Map.of("a", 1.0), PARAMS, new Random(7));

        assertThat(ranked.get("c")).isLessThan(ranked.get("a"));
        assertThat(ranked.get("c")).isLessThan(ranked.get("b"));
    }

    @Test
    void deadEndWalkRestartsAtSeed() {
        // A -> D, D has no outgoing edges: walks must restart at A rather than stall, and D still
        // accrues visits. The run must terminate (no infinite loop).
        Map<String, List<String>> adjacency =
                Map.of(
                        "a", List.of("d"),
                        "d", List.of());

        Map<String, Double> ranked =
                MonteCarloPpr.rank(adjacency, Map.of("a", 1.0), PARAMS, new Random(1));

        assertThat(ranked).containsKeys("a", "d");
        assertThat(ranked.get("d")).isGreaterThan(0.0);
        assertThat(ranked.get("a")).isGreaterThan(ranked.get("d"));
    }

    @Test
    void emptySeedsReturnEmpty() {
        Map<String, List<String>> adjacency = Map.of("a", List.of("b"), "b", List.of("a"));

        assertThat(MonteCarloPpr.rank(adjacency, Map.of(), PARAMS, new Random(1))).isEmpty();
    }

    @Test
    void deterministicForFixedSeed() {
        Map<String, List<String>> adjacency =
                Map.of("a", List.of("b"), "b", List.of("a", "c"), "c", List.of("b"));

        Map<String, Double> first =
                MonteCarloPpr.rank(adjacency, Map.of("a", 1.0), PARAMS, new Random(99));
        Map<String, Double> second =
                MonteCarloPpr.rank(adjacency, Map.of("a", 1.0), PARAMS, new Random(99));

        assertThat(first).isEqualTo(second);
    }
}
