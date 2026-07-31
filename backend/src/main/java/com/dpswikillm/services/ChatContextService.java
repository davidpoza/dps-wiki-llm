package com.dpswikillm.services;

import com.dpswikillm.domain.ContextSource;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ChatContextSettingsDto;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Builds the knowledge-base context packet for a chat turn. Retrieves the top-K semantic hits and,
 * when enabled, expands the context by following {@code [[wikilinks]]} up to a configured depth.
 * Linked candidates are ranked by similarity to the query and included greedily — direct hits
 * first, then linked notes by descending score — under a character budget, so context never grows
 * unbounded. Also returns the ordered list of notes actually loaded, for per-message provenance.
 */
@Service
public class ChatContextService {
    private static final Logger log = LoggerFactory.getLogger(ChatContextService.class);

    private final EmbeddingClient embeddingClient;
    private final DocumentIndexRepository repository;
    private final WikiLinkResolver linkResolver;

    public ChatContextService(
            EmbeddingClient embeddingClient,
            DocumentIndexRepository repository,
            WikiLinkResolver linkResolver) {
        this.embeddingClient = embeddingClient;
        this.repository = repository;
        this.linkResolver = linkResolver;
    }

    /** Assembled context text plus the ordered notes that were included in it. */
    public record ContextPacket(String contextText, List<ContextSource> sources) {}

    private record Entry(String path, String body, double score, ContextSource.Provenance provenance, int depth) {}

    public ContextPacket build(String question, ChatContextSettingsDto settings) {
        if (question == null || question.isBlank()) {
            return new ContextPacket("", List.of());
        }

        float[] queryVector = embeddingClient.embedQuery(question);
        List<SearchResult> hits = repository.semanticSearch(queryVector, Math.max(1, settings.topK()));

        List<Entry> entries = new ArrayList<>();
        for (SearchResult hit : hits) {
            entries.add(
                    new Entry(
                            hit.path(),
                            hit.body(),
                            hit.score(),
                            ContextSource.Provenance.DIRECT,
                            0));
        }

        if (settings.expansionEnabled() && settings.maxDepth() > 0 && settings.maxLinkedNotes() > 0) {
            entries.addAll(expand(queryVector, hits, settings));
        }

        return assemble(entries, settings.contextBudgetChars());
    }

    /** Discovers linked candidates via BFS, ranks them by query similarity, and caps the count. */
    private List<Entry> expand(
            float[] queryVector, List<SearchResult> hits, ChatContextSettingsDto settings) {
        Map<String, Integer> candidateDepth;
        try {
            candidateDepth = discoverLinkedCandidates(hits, settings.maxDepth());
        } catch (IOException | RuntimeException ex) {
            log.warn("Chat link expansion failed; falling back to direct hits only", ex);
            return List.of();
        }
        if (candidateDepth.isEmpty()) {
            return List.of();
        }

        List<SearchResult> ranked =
                repository.scorePathsAgainstQuery(
                        queryVector, new ArrayList<>(candidateDepth.keySet()));

        List<Entry> linked = new ArrayList<>();
        for (SearchResult sr : ranked) {
            if (linked.size() >= settings.maxLinkedNotes()) {
                break;
            }
            linked.add(
                    new Entry(
                            sr.path(),
                            sr.body(),
                            sr.score(),
                            ContextSource.Provenance.LINKED,
                            candidateDepth.getOrDefault(sr.path(), 1)));
        }
        return linked;
    }

    /**
     * Breadth-first walk of resolved {@code [[wikilinks]]} starting from the direct hits, up to
     * {@code maxDepth} hops. Returns each newly reached note path mapped to the (minimum) depth at
     * which it was found, excluding the direct hits themselves.
     */
    private Map<String, Integer> discoverLinkedCandidates(List<SearchResult> hits, int maxDepth)
            throws IOException {
        List<Path> files = linkResolver.collectMarkdownFiles();
        Map<String, String> slugIndex = linkResolver.buildSlugIndex(files);

        Set<String> visited = new HashSet<>();
        Map<String, String> currentLevel = new LinkedHashMap<>();
        for (SearchResult hit : hits) {
            visited.add(hit.path());
            currentLevel.put(hit.path(), hit.body() != null ? hit.body() : "");
        }

        Map<String, Integer> candidateDepth = new LinkedHashMap<>();
        for (int depth = 1; depth <= maxDepth; depth += 1) {
            Set<String> discovered = new LinkedHashSet<>();
            for (String body : currentLevel.values()) {
                for (String target : linkResolver.extractLinkedTargets(body, slugIndex)) {
                    if (visited.add(target)) {
                        candidateDepth.put(target, depth);
                        discovered.add(target);
                    }
                }
            }
            if (discovered.isEmpty() || depth == maxDepth) {
                break;
            }
            currentLevel = repository.findBodiesByPaths(new ArrayList<>(discovered));
        }
        return candidateDepth;
    }

    /** Concatenates entries as {@code ### path\n body} under the character budget, direct first. */
    private ContextPacket assemble(List<Entry> entries, int budget) {
        StringBuilder sb = new StringBuilder();
        List<ContextSource> sources = new ArrayList<>();
        for (Entry e : entries) {
            String body = e.body() != null ? e.body() : "";
            String header = "### " + e.path() + "\n";
            if (sb.length() + header.length() + body.length() > budget) {
                int remaining = budget - sb.length() - header.length();
                if (remaining > 0) {
                    sb.append(header).append(body, 0, remaining);
                    sources.add(toSource(e));
                }
                break;
            }
            sb.append(header).append(body).append("\n\n");
            sources.add(toSource(e));
        }
        return new ContextPacket(sb.toString(), sources);
    }

    private static ContextSource toSource(Entry e) {
        return new ContextSource(e.path(), e.score(), e.provenance(), e.depth());
    }
}
