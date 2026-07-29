package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LinkDiscoveryService {
    private static final Logger log = LoggerFactory.getLogger(LinkDiscoveryService.class);
    private static final double DEFAULT_THRESHOLD = 0.72;
    private static final String THRESHOLD_SETTING_KEY = "link.similarity-threshold";
    // Fetch a broad pool so r_k(A) and CSLS re-ranking see a meaningful distribution; the pool must
    // stay well above MAX_RESULTS or genuine neighbors past rank-N are dropped before CSLS scores
    // them.
    private static final int CANDIDATE_POOL = 40;
    private static final int MAX_RESULTS = 10;

    public record LinkDiscoveryProgress(String step, int current, int total) {}

    public record DiscoveredLink(String path, String title, String docType, double score) {}

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final SemanticSearchService semanticSearchService;
    private final DocumentIndexRepository documentIndexRepository;
    private final AppProperties properties;
    private final AppSettingRepository settingRepository;
    private final WikiLinkResolver linkResolver;

    public LinkDiscoveryService(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            SemanticSearchService semanticSearchService,
            DocumentIndexRepository documentIndexRepository,
            AppProperties properties,
            AppSettingRepository settingRepository,
            WikiLinkResolver linkResolver) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.semanticSearchService = semanticSearchService;
        this.documentIndexRepository = documentIndexRepository;
        this.properties = properties;
        this.settingRepository = settingRepository;
        this.linkResolver = linkResolver;
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

        // Already-linked targets are resolved from the note's own wiki-links (case/path/alias aware)
        // and excluded authoritatively here, so results never re-suggest a link the note already has.
        Set<String> alreadyLinked =
                linkResolver.extractLinkedTargets(
                        content, linkResolver.buildSlugIndex(linkResolver.collectMarkdownFiles()));

        // Nearest neighbors of A, sorted by cosine desc, excluding A itself and existing links.
        List<SearchResult> neighbors =
                semanticSearchService.search(query, CANDIDATE_POOL).stream()
                        .filter(r -> !r.path().equals(normalized))
                        .filter(r -> !alreadyLinked.contains(r.path()))
                        .toList();

        double coarseThreshold = readThreshold();
        double margin = LinkRankingSettings.cslsMargin(settingRepository);
        int k = LinkRankingSettings.hubnessK(settingRepository);
        Map<String, Double> hubnessByPath =
                documentIndexRepository.findHubnessByPath(properties.embeddings().model());
        // r_k(A): the source's stored hubness, or its live top-k mean when not yet backfilled.
        Double storedRkA = hubnessByPath.get(normalized);
        double rkA = storedRkA != null ? storedRkA : CslsRanker.meanTopK(neighbors, k);

        List<DiscoveredLink> results =
                CslsRanker.select(
                                neighbors, rkA, hubnessByPath, coarseThreshold, margin, MAX_RESULTS)
                        .stream()
                        .map(r -> new DiscoveredLink(r.path(), r.title(), r.docType(), r.score()))
                        .toList();

        onProgress.accept(new LinkDiscoveryProgress("done", 3, 3));
        return results;
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
