package com.dpswikillm.services;

import com.dpswikillm.repositories.AppSettingRepository;

/**
 * Tunable settings and scoring shared by the link-discovery ranking pipeline. Values are stored as
 * lazy {@code app_settings} rows (like {@code link.similarity-threshold}) and read with code
 * defaults so they can be changed without a redeploy.
 */
final class LinkRankingSettings {
    static final String HUBNESS_K_KEY = "link.hubness-k";
    static final int DEFAULT_HUBNESS_K = 10;
    static final String CSLS_MARGIN_KEY = "link.csls-margin";
    static final double DEFAULT_CSLS_MARGIN = 0.05;

    // Graph-based discovery: Monte Carlo Personalized PageRank parameters (Fogaras/Haveliwala).
    static final String PPR_WALKS_KEY = "link.ppr-walks";
    static final int DEFAULT_PPR_WALKS = 3000;
    static final String PPR_WALK_LENGTH_KEY = "link.ppr-walk-length";
    static final int DEFAULT_PPR_WALK_LENGTH = 50;
    static final String PPR_RESTART_KEY = "link.ppr-restart";
    static final double DEFAULT_PPR_RESTART = 0.15;
    // Number of lex seeds beyond which the substring scan is skipped (cascade truncation).
    static final String GRAPH_SUFFICIENT_SEEDS_KEY = "link.graph-sufficient-seeds";
    static final int DEFAULT_GRAPH_SUFFICIENT_SEEDS = 12;

    private LinkRankingSettings() {}

    /** Neighbor count k used when computing the hubness statistic r_k. */
    static int hubnessK(AppSettingRepository repository) {
        return repository
                .findById(HUBNESS_K_KEY)
                .map(
                        setting -> {
                            try {
                                return Integer.parseInt(setting.getValue());
                            } catch (NumberFormatException ex) {
                                return DEFAULT_HUBNESS_K;
                            }
                        })
                .orElse(DEFAULT_HUBNESS_K);
    }

    /** Minimum CSLS score for a candidate to be accepted as a link. */
    static double cslsMargin(AppSettingRepository repository) {
        return repository
                .findById(CSLS_MARGIN_KEY)
                .map(
                        setting -> {
                            try {
                                return Double.parseDouble(setting.getValue());
                            } catch (NumberFormatException ex) {
                                return DEFAULT_CSLS_MARGIN;
                            }
                        })
                .orElse(DEFAULT_CSLS_MARGIN);
    }

    /**
     * Cross-domain Similarity Local Scaling. Penalizes both a candidate that sits near everything
     * (high {@code rkB}) and a source in a dense region (high {@code rkA}), so only pairs that are
     * specifically close to each other score positively.
     */
    static double csls(double cosine, double rkA, double rkB) {
        return 2 * cosine - rkA - rkB;
    }

    /** Number of random walks for Monte Carlo PPR. */
    static int pprWalks(AppSettingRepository repository) {
        return intSetting(repository, PPR_WALKS_KEY, DEFAULT_PPR_WALKS);
    }

    /** Length (steps) of each PPR random walk. */
    static int pprWalkLength(AppSettingRepository repository) {
        return intSetting(repository, PPR_WALK_LENGTH_KEY, DEFAULT_PPR_WALK_LENGTH);
    }

    /** Restart (teleport-to-seed) probability at each PPR step. */
    static double pprRestart(AppSettingRepository repository) {
        return repository
                .findById(PPR_RESTART_KEY)
                .map(
                        setting -> {
                            try {
                                return Double.parseDouble(setting.getValue());
                            } catch (NumberFormatException ex) {
                                return DEFAULT_PPR_RESTART;
                            }
                        })
                .orElse(DEFAULT_PPR_RESTART);
    }

    /** Lex-seed count beyond which the substring scan is skipped (cascade truncation). */
    static int graphSufficientSeeds(AppSettingRepository repository) {
        return intSetting(repository, GRAPH_SUFFICIENT_SEEDS_KEY, DEFAULT_GRAPH_SUFFICIENT_SEEDS);
    }

    private static int intSetting(AppSettingRepository repository, String key, int fallback) {
        return repository
                .findById(key)
                .map(
                        setting -> {
                            try {
                                return Integer.parseInt(setting.getValue());
                            } catch (NumberFormatException ex) {
                                return fallback;
                            }
                        })
                .orElse(fallback);
    }
}
