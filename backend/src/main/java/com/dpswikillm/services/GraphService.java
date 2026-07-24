package com.dpswikillm.services;

import com.dpswikillm.dto.GraphEdgeDto;
import com.dpswikillm.dto.GraphNodeDto;
import com.dpswikillm.dto.GraphResponseDto;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class GraphService {
    private static final Logger log = LoggerFactory.getLogger(GraphService.class);
    private static final Pattern WIKI_LINK =
            Pattern.compile("\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]");

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;

    public GraphService(VaultPathResolver pathResolver, MarkdownService markdownService) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
    }

    public GraphResponseDto buildGraph() throws IOException {
        Path vaultRoot = pathResolver.vaultRoot();
        List<Path> mdFiles = collectMarkdownFiles(vaultRoot);

        // slug (lowercase stem) → relative path
        Map<String, String> slugIndex = buildSlugIndex(vaultRoot, mdFiles);

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

    private void extractEdges(
            String sourceRelPath,
            String content,
            Map<String, String> slugIndex,
            List<GraphEdgeDto> edges,
            java.util.Set<String> edgeKeys) {
        Matcher m = WIKI_LINK.matcher(content);
        while (m.find()) {
            String raw = m.group(1).trim();
            String target = resolveSlug(raw, slugIndex);
            if (target != null && !target.equals(sourceRelPath)) {
                // Normalize key so A→B and B→A produce the same key
                String key = sourceRelPath.compareTo(target) < 0
                        ? sourceRelPath + "\0" + target
                        : target + "\0" + sourceRelPath;
                if (edgeKeys.add(key)) {
                    edges.add(new GraphEdgeDto(sourceRelPath, target));
                }
            }
        }
    }

    private String resolveSlug(String raw, Map<String, String> slugIndex) {
        // Try exact path match first (e.g. wiki/concepts/quantum)
        String normalized = raw.toLowerCase(Locale.ROOT);
        if (slugIndex.containsKey(normalized)) {
            return slugIndex.get(normalized);
        }
        // Try basename only
        String baseName =
                normalized.contains("/")
                        ? normalized.substring(normalized.lastIndexOf('/') + 1)
                        : normalized;
        return slugIndex.get(baseName);
    }

    private Map<String, String> buildSlugIndex(Path vaultRoot, List<Path> files) {
        Map<String, String> index = new HashMap<>();
        for (Path file : files) {
            String rel = vaultRoot.relativize(file).toString().replace('\\', '/');
            String withoutExt = rel.endsWith(".md") ? rel.substring(0, rel.length() - 3) : rel;
            String baseName =
                    withoutExt.contains("/")
                            ? withoutExt.substring(withoutExt.lastIndexOf('/') + 1)
                            : withoutExt;
            // Full path without extension (lower) → rel path
            index.putIfAbsent(withoutExt.toLowerCase(Locale.ROOT), rel);
            // Base name (lower) → rel path (first match wins for ambiguous stems)
            index.putIfAbsent(baseName.toLowerCase(Locale.ROOT), rel);
        }
        return index;
    }

    private List<Path> collectMarkdownFiles(Path vaultRoot) throws IOException {
        Path wikiRoot = vaultRoot.resolve("wiki");
        if (!Files.exists(wikiRoot)) {
            return List.of();
        }
        List<Path> files = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(wikiRoot)) {
            stream.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".md"))
                    .sorted()
                    .forEach(files::add);
        }
        return files;
    }
}
