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
}
