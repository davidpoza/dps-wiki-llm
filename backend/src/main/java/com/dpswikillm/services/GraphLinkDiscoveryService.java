package com.dpswikillm.services;

import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.services.LinkDiscoveryService.DiscoveredLink;
import com.dpswikillm.services.LinkDiscoveryService.LinkDiscoveryProgress;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Graph-based link discovery: a lean, LLM-free seed-selection cascade modeled on the Karpathy
 * LLM-Wiki plugin. Stage 1 lex fast path (token overlap against titles/aliases), stage 2 local
 * substring scan (broadens recall), then Monte Carlo Personalized PageRank over the {@code
 * [[wiki-link]]} graph to surface graph-aware multi-hop neighbors. The cascade truncates early and
 * skips PPR when no seeds are found. Results reuse {@link DiscoveredLink} so the SSE payload and
 * modal rendering are identical to the semantic path.
 */
@Service
public class GraphLinkDiscoveryService {
    private static final Logger log = LoggerFactory.getLogger(GraphLinkDiscoveryService.class);
    private static final int MAX_RESULTS = 10;
    private static final int MIN_TOKEN_LEN = 3;
    private static final int MIN_SUBSTRING_LEN = 4;
    private static final double LEX_WEIGHT = 3.0;
    private static final double SUBSTRING_WEIGHT = 1.0;
    private static final int BODY_SNIPPET_CHARS = 2000;
    private static final Pattern NON_ALNUM = Pattern.compile("[^\\p{Alnum}]+");

    private record NoteMeta(
            String path, String title, String docType, Set<String> lexTokens, String haystack) {}

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final WikiLinkResolver linkResolver;
    private final GraphService graphService;
    private final AppSettingRepository settingRepository;

    public GraphLinkDiscoveryService(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            WikiLinkResolver linkResolver,
            GraphService graphService,
            AppSettingRepository settingRepository) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.linkResolver = linkResolver;
        this.graphService = graphService;
        this.settingRepository = settingRepository;
    }

    public List<DiscoveredLink> discover(String wikiPath, Consumer<LinkDiscoveryProgress> onProgress)
            throws IOException {
        String normalized = pathResolver.normalizeRelativePath(wikiPath);
        Path absolute = pathResolver.resolve(normalized);
        if (!Files.exists(absolute)) {
            throw new IllegalArgumentException("Document not found: " + normalized);
        }
        String content = Files.readString(absolute, StandardCharsets.UTF_8);
        var sourceDoc = markdownService.parse(content);

        // Source-side probe terms: title + keywords + aliases tokens.
        Set<String> sourceTerms = new LinkedHashSet<>();
        sourceTerms.addAll(tokenize(sourceDoc.title()));
        sourceTerms.addAll(tokenize(frontmatterList(sourceDoc.frontmatter(), "keywords")));
        sourceTerms.addAll(tokenize(frontmatterList(sourceDoc.frontmatter(), "aliases")));

        List<Path> files = linkResolver.collectMarkdownFiles();
        Map<String, String> slugIndex = linkResolver.buildSlugIndex(files);
        Set<String> alreadyLinked = linkResolver.extractLinkedTargets(content, slugIndex);
        Map<String, NoteMeta> notes = buildNoteMetadata(files, slugIndex);

        // Stage 1 — lex fast path: token overlap against note titles/aliases.
        onProgress.accept(new LinkDiscoveryProgress("lex", 1, 4));
        Map<String, Double> seeds = new HashMap<>();
        for (NoteMeta note : notes.values()) {
            if (isExcluded(note.path(), normalized, alreadyLinked)) {
                continue;
            }
            long overlap = note.lexTokens().stream().filter(sourceTerms::contains).count();
            if (overlap > 0) {
                seeds.merge(note.path(), LEX_WEIGHT * overlap, Double::sum);
            }
        }

        // Stage 2 — local substring scan (skipped when the lex stage already yields enough seeds).
        onProgress.accept(new LinkDiscoveryProgress("substring", 2, 4));
        if (seeds.size() < LinkRankingSettings.graphSufficientSeeds(settingRepository)) {
            List<String> probes =
                    sourceTerms.stream().filter(t -> t.length() >= MIN_SUBSTRING_LEN).toList();
            for (NoteMeta note : notes.values()) {
                if (seeds.containsKey(note.path())
                        || isExcluded(note.path(), normalized, alreadyLinked)) {
                    continue;
                }
                boolean hit = probes.stream().anyMatch(p -> note.haystack().contains(p));
                if (hit) {
                    seeds.merge(note.path(), SUBSTRING_WEIGHT, Double::sum);
                }
            }
        }

        // Empty seed set short-circuits: no PPR, no results.
        if (seeds.isEmpty()) {
            onProgress.accept(new LinkDiscoveryProgress("done", 4, 4));
            return List.of();
        }

        // Stage 3 — PPR expansion over the wiki-link graph.
        onProgress.accept(new LinkDiscoveryProgress("ppr", 3, 4));
        Map<String, List<String>> adjacency = graphService.buildAdjacency();
        MonteCarloPpr.Params params =
                new MonteCarloPpr.Params(
                        LinkRankingSettings.pprWalks(settingRepository),
                        LinkRankingSettings.pprWalkLength(settingRepository),
                        LinkRankingSettings.pprRestart(settingRepository));
        // Deterministic per-note seed: same note yields the same suggestions across runs.
        Random random = new Random(normalized.hashCode());
        Map<String, Double> ranked = MonteCarloPpr.rank(adjacency, seeds, params, random);

        List<Map.Entry<String, Double>> ordered =
                ranked.entrySet().stream()
                        .filter(e -> !isExcluded(e.getKey(), normalized, alreadyLinked))
                        .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                        .limit(MAX_RESULTS)
                        .toList();

        double max = ordered.isEmpty() ? 1.0 : ordered.get(0).getValue();
        List<DiscoveredLink> results = new ArrayList<>();
        for (Map.Entry<String, Double> entry : ordered) {
            NoteMeta note = notes.get(entry.getKey());
            String title = note != null ? note.title() : stem(entry.getKey());
            String docType = note != null ? note.docType() : inferDocType(entry.getKey());
            double score = max > 0 ? entry.getValue() / max : 0.0;
            results.add(new DiscoveredLink(entry.getKey(), title, docType, score));
        }

        onProgress.accept(new LinkDiscoveryProgress("done", 4, 4));
        return results;
    }

    private static boolean isExcluded(String path, String source, Set<String> alreadyLinked) {
        return path.equals(source) || alreadyLinked.contains(path);
    }

    private Map<String, NoteMeta> buildNoteMetadata(List<Path> files, Map<String, String> slugIndex) {
        Path vaultRoot = pathResolver.vaultRoot();
        Map<String, NoteMeta> notes = new HashMap<>();
        for (Path file : files) {
            String relPath = vaultRoot.relativize(file).toString().replace('\\', '/');
            try {
                String content = Files.readString(file, StandardCharsets.UTF_8);
                var doc = markdownService.parse(content);
                String title = doc.title() == null || doc.title().isBlank() ? stem(relPath) : doc.title();
                List<String> aliases = frontmatterList(doc.frontmatter(), "aliases");
                Set<String> lexTokens = new LinkedHashSet<>(tokenize(title));
                lexTokens.addAll(tokenize(aliases));
                String snippet =
                        content.length() > BODY_SNIPPET_CHARS
                                ? content.substring(0, BODY_SNIPPET_CHARS)
                                : content;
                String haystack =
                        (title + " " + String.join(" ", aliases) + " " + snippet)
                                .toLowerCase(Locale.ROOT);
                notes.put(
                        relPath,
                        new NoteMeta(relPath, title, inferDocType(relPath), lexTokens, haystack));
            } catch (IOException ex) {
                log.warn("Could not read {}: {}", file, ex.getMessage());
            }
        }
        return notes;
    }

    @SuppressWarnings("unchecked")
    private static List<String> frontmatterList(Map<String, Object> frontmatter, String key) {
        Object raw = frontmatter.get(key);
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object item : list) {
                if (item != null) {
                    out.add(item.toString());
                }
            }
            return out;
        }
        return List.of();
    }

    private static Set<String> tokenize(String text) {
        Set<String> tokens = new LinkedHashSet<>();
        if (text == null || text.isBlank()) {
            return tokens;
        }
        for (String token : NON_ALNUM.split(text.toLowerCase(Locale.ROOT))) {
            if (token.length() >= MIN_TOKEN_LEN) {
                tokens.add(token);
            }
        }
        return tokens;
    }

    private static Set<String> tokenize(List<String> texts) {
        Set<String> tokens = new LinkedHashSet<>();
        for (String text : texts) {
            tokens.addAll(tokenize(text));
        }
        return tokens;
    }

    private static String stem(String relPath) {
        String name = relPath.contains("/") ? relPath.substring(relPath.lastIndexOf('/') + 1) : relPath;
        return name.endsWith(".md") ? name.substring(0, name.length() - 3) : name;
    }

    private static String inferDocType(String relPath) {
        String lower = relPath.toLowerCase(Locale.ROOT);
        if (lower.contains("/topics/")) {
            return "topic";
        }
        if (lower.contains("/concepts/")) {
            return "concept";
        }
        return "note";
    }
}
