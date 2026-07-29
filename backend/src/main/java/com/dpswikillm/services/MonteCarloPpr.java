package com.dpswikillm.services;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Monte Carlo Personalized PageRank (Fogaras 2005) over the {@code [[wiki-link]]} graph. Runs a
 * fixed number of random walks of fixed length from a weighted seed set, teleporting back to a seed
 * with the restart probability (Haveliwala 2002) and on dead-end nodes, and ranks nodes by visit
 * frequency. Cost is {@code O(walks × length)}, independent of graph size. The {@link Random} is
 * injected so ranking is deterministic under test.
 */
final class MonteCarloPpr {

    record Params(int walks, int walkLength, double restartProbability) {}

    private MonteCarloPpr() {}

    /**
     * Ranks nodes reachable from the seeds by PPR visit frequency (a distribution summing to ~1).
     * Returns an empty map when there are no seeds.
     */
    static Map<String, Double> rank(
            Map<String, List<String>> adjacency,
            Map<String, Double> seedWeights,
            Params params,
            Random random) {
        Map<String, Double> result = new HashMap<>();
        if (seedWeights == null || seedWeights.isEmpty()) {
            return result;
        }

        // Stable seed order + cumulative weights so seed sampling is reproducible for a given RNG.
        List<String> seeds = new ArrayList<>(seedWeights.keySet());
        Collections.sort(seeds);
        double[] cumulative = new double[seeds.size()];
        double total = 0;
        for (int i = 0; i < seeds.size(); i++) {
            total += Math.max(0.0, seedWeights.getOrDefault(seeds.get(i), 0.0));
            cumulative[i] = total;
        }
        if (total <= 0) {
            for (int i = 0; i < seeds.size(); i++) {
                cumulative[i] = i + 1;
            }
            total = seeds.size();
        }

        int walks = Math.max(0, params.walks());
        int length = Math.max(1, params.walkLength());
        double restart = params.restartProbability();

        Map<String, Long> visits = new HashMap<>();
        long totalVisits = 0;
        for (int w = 0; w < walks; w++) {
            String current = sampleSeed(seeds, cumulative, total, random);
            for (int step = 0; step < length; step++) {
                visits.merge(current, 1L, Long::sum);
                totalVisits++;
                List<String> neighbors = adjacency.get(current);
                boolean deadEnd = neighbors == null || neighbors.isEmpty();
                if (deadEnd || random.nextDouble() < restart) {
                    current = sampleSeed(seeds, cumulative, total, random);
                } else {
                    current = neighbors.get(random.nextInt(neighbors.size()));
                }
            }
        }

        if (totalVisits == 0) {
            return result;
        }
        for (Map.Entry<String, Long> entry : visits.entrySet()) {
            result.put(entry.getKey(), entry.getValue().doubleValue() / totalVisits);
        }
        return result;
    }

    private static String sampleSeed(
            List<String> seeds, double[] cumulative, double total, Random random) {
        double r = random.nextDouble() * total;
        for (int i = 0; i < seeds.size(); i++) {
            if (r < cumulative[i]) {
                return seeds.get(i);
            }
        }
        return seeds.get(seeds.size() - 1);
    }
}
