package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LinkDiscoveryService {
    private static final Logger log = LoggerFactory.getLogger(LinkDiscoveryService.class);
    private static final double DEFAULT_THRESHOLD = 0.72;
    private static final String THRESHOLD_SETTING_KEY = "link.similarity-threshold";
    // Fetch more candidates than needed so r_k(A) and the CSLS margin see a meaningful distribution
    private static final int CANDIDATE_POOL = 20;
    private static final int MAX_RESULTS = 10;

    public record LinkDiscoveryProgress(String step, int current, int total) {}

    public record DiscoveredLink(String path, String title, String docType, double score) {}

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final SemanticSearchService semanticSearchService;
    private final DocumentIndexRepository documentIndexRepository;
    private final AppProperties properties;
    private final AppSettingRepository settingRepository;

    public LinkDiscoveryService(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            SemanticSearchService semanticSearchService,
            DocumentIndexRepository documentIndexRepository,
            AppProperties properties,
            AppSettingRepository settingRepository) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.semanticSearchService = semanticSearchService;
        this.documentIndexRepository = documentIndexRepository;
        this.properties = properties;
        this.settingRepository = settingRepository;
    }

    public List<DiscoveredLink> discover(
            String wikiPath, Consumer<LinkDiscoveryProgress> onProgress) throws IOException {
        onProgress.accept(new LinkDiscoveryProgress("loading", 1, 3));

        String normalized = pathResolver.normalizeRelativePath(wikiPath);
        Path absolute = pathResolver.resolve(normalized);
        if (!Files.exists(absolute)) {
            throw new IllegalArgumentException("Document not found: " + normalized);
        }
        String content = Files.readString(absolute, StandardCharsets.UTF_8);
        var md = markdownService.parse(content);
        String title = md.title().isBlank() ? wikiPath : md.title();

        String query = buildQuery(title, md.frontmatter());

        onProgress.accept(new LinkDiscoveryProgress("searching", 2, 3));

        // Nearest neighbors of A, sorted by cosine desc, excluding A itself.
        List<SearchResult> neighbors =
                semanticSearchService.search(query, CANDIDATE_POOL).stream()
                        .filter(r -> !r.path().equals(normalized))
                        .toList();

        double coarseThreshold = readThreshold();
        double margin = LinkRankingSettings.cslsMargin(settingRepository);
        int k = LinkRankingSettings.hubnessK(settingRepository);
        // r_k(A): mean cosine of A to its k nearest neighbors (the top of this same retrieval).
        double rkA = meanTopK(neighbors, k);
        Map<String, Double> hubnessByPath =
                documentIndexRepository.findHubnessByPath(properties.embeddings().model());

        List<DiscoveredLink> results =
                selectByCsls(neighbors, rkA, hubnessByPath, coarseThreshold, margin);

        onProgress.accept(new LinkDiscoveryProgress("done", 3, 3));
        return results;
    }

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
     * Rank candidates by CSLS and keep only those clearing the acceptance margin. Returns an empty
     * list when nothing is genuinely related — no raw-cosine fallback. The absolute threshold is a
     * coarse pool pre-filter only. The displayed {@code score} stays the raw cosine; ordering
     * follows CSLS.
     */
    static List<DiscoveredLink> selectByCsls(
            List<SearchResult> neighbors,
            double rkA,
            Map<String, Double> hubnessByPath,
            double coarseThreshold,
            double margin) {
        record Scored(DiscoveredLink link, double csls) {}
        return neighbors.stream()
                .filter(r -> r.score() >= coarseThreshold)
                .map(
                        r -> {
                            double cosine = r.score();
                            Double rkB = hubnessByPath.get(r.path());
                            // Missing r_k(B): assume source-like density so ordering stays
                            // monotonic in raw cosine rather than dropping the candidate.
                            double rkBValue = rkB != null ? rkB : rkA;
                            double csls = LinkRankingSettings.csls(cosine, rkA, rkBValue);
                            return new Scored(
                                    new DiscoveredLink(r.path(), r.title(), r.docType(), cosine),
                                    csls);
                        })
                .filter(s -> s.csls() >= margin)
                .sorted(Comparator.comparingDouble(Scored::csls).reversed())
                .limit(MAX_RESULTS)
                .map(Scored::link)
                .toList();
    }

    private double readThreshold() {
        return settingRepository
                .findById(THRESHOLD_SETTING_KEY)
                .map(
                        s -> {
                            try {
                                return Double.parseDouble(s.getValue());
                            } catch (NumberFormatException ex) {
                                log.warn(
                                        "Invalid link.similarity-threshold value '{}', using default {}",
                                        s.getValue(),
                                        DEFAULT_THRESHOLD);
                                return DEFAULT_THRESHOLD;
                            }
                        })
                .orElse(DEFAULT_THRESHOLD);
    }

    private static String buildQuery(String title, java.util.Map<String, Object> frontmatter) {
        Object raw = frontmatter.get("keywords");
        if (raw instanceof List<?> kw && !kw.isEmpty()) {
            String joined =
                    kw.stream()
                            .map(k -> k.toString().replace('-', ' '))
                            .collect(java.util.stream.Collectors.joining(", "));
            return "Primary topic: "
                    + title.replace('-', ' ')
                    + ". Related concepts: "
                    + joined
                    + ".";
        }
        return title;
    }
}
