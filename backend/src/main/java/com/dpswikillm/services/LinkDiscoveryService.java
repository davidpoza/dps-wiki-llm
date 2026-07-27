package com.dpswikillm.services;

import com.dpswikillm.repositories.AppSettingRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LinkDiscoveryService {
    private static final Logger log = LoggerFactory.getLogger(LinkDiscoveryService.class);
    private static final double DEFAULT_THRESHOLD = 0.72;
    private static final String THRESHOLD_SETTING_KEY = "link.similarity-threshold";
    // Fetch more candidates than needed so the relative filter has a meaningful distribution
    private static final int CANDIDATE_POOL = 20;
    private static final int MAX_RESULTS = 10;

    public record LinkDiscoveryProgress(String step, int current, int total) {}

    public record DiscoveredLink(String path, String title, String docType, double score) {}

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final SemanticSearchService semanticSearchService;
    private final AppSettingRepository settingRepository;

    public LinkDiscoveryService(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            SemanticSearchService semanticSearchService,
            AppSettingRepository settingRepository) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.semanticSearchService = semanticSearchService;
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

        double absoluteThreshold = readThreshold();
        List<DiscoveredLink> pool =
                semanticSearchService.search(query, CANDIDATE_POOL).stream()
                        .filter(r -> r.score() >= absoluteThreshold && !r.path().equals(normalized))
                        .map(r -> new DiscoveredLink(r.path(), r.title(), r.docType(), r.score()))
                        .toList();

        List<DiscoveredLink> results = applyRelativeFilter(pool);

        onProgress.accept(new LinkDiscoveryProgress("done", 3, 3));
        return results;
    }

    private static List<DiscoveredLink> applyRelativeFilter(List<DiscoveredLink> candidates) {
        if (candidates.size() < 3) {
            return candidates.stream().limit(MAX_RESULTS).toList();
        }
        double[] scores = candidates.stream().mapToDouble(DiscoveredLink::score).toArray();
        double mean = java.util.Arrays.stream(scores).average().orElse(0);
        double variance = java.util.Arrays.stream(scores)
                .map(s -> (s - mean) * (s - mean))
                .average()
                .orElse(0);
        double stddev = Math.sqrt(variance);
        double relativeMin = mean + 2 * stddev;
        List<DiscoveredLink> filtered = candidates.stream()
                .filter(c -> c.score() >= relativeMin)
                .limit(MAX_RESULTS)
                .toList();
        // Fallback: if no candidate clears mean+2σ (very flat distribution), return top 3
        return filtered.isEmpty() ? candidates.stream().limit(3).toList() : filtered;
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
            String joined = kw.stream()
                    .map(k -> k.toString().replace('-', ' '))
                    .collect(java.util.stream.Collectors.joining(", "));
            return "Primary topic: " + title.replace('-', ' ') + ". Related concepts: " + joined + ".";
        }
        return title;
    }
}
