package com.dpswikillm.services;

import com.dpswikillm.dto.GraphEdgeDto;
import com.dpswikillm.dto.GraphNodeDto;
import com.dpswikillm.dto.GraphResponseDto;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class GraphService {
    private static final Logger log = LoggerFactory.getLogger(GraphService.class);

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final WikiLinkResolver linkResolver;

    public GraphService(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            WikiLinkResolver linkResolver) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.linkResolver = linkResolver;
    }

    public GraphResponseDto buildGraph() throws IOException {
        Path vaultRoot = pathResolver.vaultRoot();
        List<Path> mdFiles = linkResolver.collectMarkdownFiles();
        Map<String, String> slugIndex = linkResolver.buildSlugIndex(mdFiles);

        List<GraphNodeDto> nodes = new ArrayList<>();
        List<GraphEdgeDto> edges = new ArrayList<>();
        java.util.Set<String> edgeKeys = new java.util.HashSet<>();

        for (Path file : mdFiles) {
            String relPath = vaultRoot.relativize(file).toString().replace('\\', '/');
            String label = relPath;
            try {
                String content = Files.readString(file, StandardCharsets.UTF_8);
                MarkdownDocument doc = markdownService.parse(content);
                String title = doc.title();
                if (title != null && !title.isBlank()) {
                    label = title;
                } else {
                    String name = file.getFileName().toString();
                    label = name.endsWith(".md") ? name.substring(0, name.length() - 3) : name;
                }
                extractEdges(relPath, content, slugIndex, edges, edgeKeys);
            } catch (IOException ex) {
                log.warn("Could not read {}: {}", file, ex.getMessage());
            }
            nodes.add(new GraphNodeDto(relPath, label));
        }

        return new GraphResponseDto(nodes, edges);
    }

    /**
     * Builds a walkable undirected adjacency map from the resolved {@code [[wiki-link]]} edges: each
     * node maps to its distinct neighbors, edges deduped so A↔B appears once per side. Used by
     * Personalized PageRank in graph-based link discovery.
     */
    public Map<String, List<String>> buildAdjacency() throws IOException {
        Path vaultRoot = pathResolver.vaultRoot();
        List<Path> mdFiles = linkResolver.collectMarkdownFiles();
        Map<String, String> slugIndex = linkResolver.buildSlugIndex(mdFiles);

        Map<String, java.util.LinkedHashSet<String>> adjacency = new LinkedHashMap<>();
        for (Path file : mdFiles) {
            String relPath = vaultRoot.relativize(file).toString().replace('\\', '/');
            adjacency.computeIfAbsent(relPath, k -> new java.util.LinkedHashSet<>());
            try {
                String content = Files.readString(file, StandardCharsets.UTF_8);
                for (String target : linkResolver.extractLinkedTargets(content, slugIndex)) {
                    if (target.equals(relPath)) {
                        continue;
                    }
                    adjacency.computeIfAbsent(relPath, k -> new java.util.LinkedHashSet<>())
                            .add(target);
                    adjacency.computeIfAbsent(target, k -> new java.util.LinkedHashSet<>())
                            .add(relPath);
                }
            } catch (IOException ex) {
                log.warn("Could not read {}: {}", file, ex.getMessage());
            }
        }

        Map<String, List<String>> result = new LinkedHashMap<>();
        adjacency.forEach((node, neighbors) -> result.put(node, new ArrayList<>(neighbors)));
        return result;
    }

    private void extractEdges(
            String sourceRelPath,
            String content,
            Map<String, String> slugIndex,
            List<GraphEdgeDto> edges,
            java.util.Set<String> edgeKeys) {
        Matcher m = WikiLinkResolver.WIKI_LINK.matcher(content);
        while (m.find()) {
            String raw = m.group(1).trim();
            String target = linkResolver.resolveSlug(raw, slugIndex);
            if (target != null && !target.equals(sourceRelPath)) {
                // Normalize key so A→B and B→A produce the same key
                String key =
                        sourceRelPath.compareTo(target) < 0
                                ? sourceRelPath + "\0" + target
                                : target + "\0" + sourceRelPath;
                if (edgeKeys.add(key)) {
                    edges.add(new GraphEdgeDto(sourceRelPath, target));
                }
            }
        }
    }
}
