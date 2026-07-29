package com.dpswikillm.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

/**
 * Shared resolution of {@code [[wiki-link]]} references against the vault. Owns the slug index
 * (case insensitive, full-path-stem and basename) and the raw-link → target-path resolution that
 * both {@link GraphService} (edges) and graph-based link discovery (adjacency, existing-link
 * exclusion) depend on. Extracted so exclusion and graph traversal share one authoritative resolver
 * rather than a fragile client-side basename match.
 */
@Service
public class WikiLinkResolver {
    /** Matches {@code [[target]]} and {@code [[target|alias]]}, capturing the target in group 1. */
    public static final Pattern WIKI_LINK =
            Pattern.compile("\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]");

    private final VaultPathResolver pathResolver;

    public WikiLinkResolver(VaultPathResolver pathResolver) {
        this.pathResolver = pathResolver;
    }

    /** All markdown files under {@code wiki/}, sorted; empty when the subtree does not exist. */
    public List<Path> collectMarkdownFiles() throws IOException {
        Path wikiRoot = pathResolver.vaultRoot().resolve("wiki");
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

    /**
     * Builds the slug index: full path without extension (lowercased) and basename (lowercased)
     * both map to the vault-relative path. First match wins for ambiguous stems.
     */
    public Map<String, String> buildSlugIndex(List<Path> files) {
        Path vaultRoot = pathResolver.vaultRoot();
        Map<String, String> index = new HashMap<>();
        for (Path file : files) {
            String rel = vaultRoot.relativize(file).toString().replace('\\', '/');
            String withoutExt = rel.endsWith(".md") ? rel.substring(0, rel.length() - 3) : rel;
            String baseName =
                    withoutExt.contains("/")
                            ? withoutExt.substring(withoutExt.lastIndexOf('/') + 1)
                            : withoutExt;
            index.putIfAbsent(withoutExt.toLowerCase(Locale.ROOT), rel);
            index.putIfAbsent(baseName.toLowerCase(Locale.ROOT), rel);
        }
        return index;
    }

    /**
     * Resolves a raw wiki-link target (the part before any {@code |alias}) to a vault-relative
     * path, trying a full-path match first and then a basename match. Returns {@code null} when
     * nothing resolves (broken link).
     */
    public String resolveSlug(String raw, Map<String, String> slugIndex) {
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        if (slugIndex.containsKey(normalized)) {
            return slugIndex.get(normalized);
        }
        String baseName =
                normalized.contains("/")
                        ? normalized.substring(normalized.lastIndexOf('/') + 1)
                        : normalized;
        return slugIndex.get(baseName);
    }

    /**
     * Extracts every {@code [[wiki-link]]} from {@code content} and resolves each to its target
     * path, returning the set of already-linked target paths. Aliases and case/path variants
     * collapse to the same resolved target; unresolved (broken) links are skipped.
     */
    public Set<String> extractLinkedTargets(String content, Map<String, String> slugIndex) {
        Set<String> targets = new LinkedHashSet<>();
        if (content == null) {
            return targets;
        }
        Matcher m = WIKI_LINK.matcher(content);
        while (m.find()) {
            String target = resolveSlug(m.group(1), slugIndex);
            if (target != null) {
                targets.add(target);
            }
        }
        return targets;
    }
}
