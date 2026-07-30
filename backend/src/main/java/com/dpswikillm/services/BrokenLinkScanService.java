package com.dpswikillm.services;

import com.dpswikillm.dto.BrokenLinkDeleteEntry;
import com.dpswikillm.dto.BrokenLinkEntry;
import com.dpswikillm.dto.BrokenLinkScanProgress;
import com.dpswikillm.dto.BrokenLinkScanResult;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class BrokenLinkScanService {
    private static final Logger log = LoggerFactory.getLogger(BrokenLinkScanService.class);
    private static final List<String> TARGET_FOLDERS =
            List.of("wiki/concepts", "wiki/sources", "wiki/topics");
    private static final Pattern WIKI_LINK =
            Pattern.compile("\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]");

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;

    public BrokenLinkScanService(VaultPathResolver pathResolver, MarkdownService markdownService) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
    }

    public BrokenLinkScanResult scan(Consumer<BrokenLinkScanProgress> onProgress)
            throws IOException {
        Set<String> validSlugs = buildSlugIndex();
        List<Path> files = collectFiles();
        int total = files.size();
        List<BrokenLinkEntry> broken = new ArrayList<>();

        for (int i = 0; i < files.size(); i++) {
            Path path = files.get(i);
            String relPath =
                    pathResolver.vaultRoot().relativize(path).toString().replace('\\', '/');
            try {
                String content = Files.readString(path, StandardCharsets.UTF_8);
                MarkdownDocument doc = markdownService.parse(content);
                for (Map.Entry<String, String> section : doc.sections().entrySet()) {
                    if (section.getValue() != null && !section.getValue().isBlank()) {
                        extractBrokenLinks(
                                relPath, section.getValue(), section.getKey(), validSlugs, broken);
                    }
                }
            } catch (IOException ex) {
                log.warn("Could not read {}: {}", path, ex.getMessage());
            }
            onProgress.accept(new BrokenLinkScanProgress(i + 1, total, relPath));
        }

        return new BrokenLinkScanResult(broken);
    }

    public int deleteLinks(List<BrokenLinkDeleteEntry> entries) {
        Map<String, List<String>> byFile = new HashMap<>();
        for (BrokenLinkDeleteEntry e : entries) {
            byFile.computeIfAbsent(e.sourceFile(), k -> new ArrayList<>()).add(e.link());
        }
        int deleted = 0;
        for (Map.Entry<String, List<String>> entry : byFile.entrySet()) {
            deleted += deleteLinksFromFile(entry.getKey(), entry.getValue());
        }
        return deleted;
    }

    private int deleteLinksFromFile(String relPath, List<String> linksToRemove) {
        Path path = pathResolver.resolve(relPath);
        if (!Files.exists(path)) {
            return 0;
        }
        String content;
        try {
            content = Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            log.warn("Could not read {} for deletion: {}", path, ex.getMessage());
            return 0;
        }

        Set<String> slugsToRemove = new HashSet<>();
        for (String link : linksToRemove) {
            slugsToRemove.add(link.toLowerCase(Locale.ROOT));
        }

        MarkdownDocument doc = markdownService.parse(content);
        String related = doc.sections().get("Related");
        if (related == null || related.isBlank()) {
            return 0;
        }

        List<String> kept = new ArrayList<>();
        int removed = 0;
        for (String line : related.split("\n", -1)) {
            String slug = extractSlugFromLine(line);
            if (slug != null && slugsToRemove.contains(slug.toLowerCase(Locale.ROOT))) {
                removed++;
            } else {
                kept.add(line);
            }
        }

        if (removed == 0) {
            return 0;
        }

        String newRelated = String.join("\n", kept).trim();
        Map<String, String> updatedSections = new HashMap<>(doc.sections());
        updatedSections.put("Related", newRelated);

        String newContent = renderDocument(doc, updatedSections);
        try {
            Files.writeString(path, newContent, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            log.error("Could not write {} after deletion: {}", path, ex.getMessage());
            return 0;
        }
        return removed;
    }

    private String renderDocument(MarkdownDocument doc, Map<String, String> updatedSections) {
        // Rebuild via mergeAndRender with empty additions (sections already contain final state)
        // We use a simpler approach: reconstruct without section merging
        StringBuilder sb = new StringBuilder();
        if (!doc.frontmatter().isEmpty()) {
            sb.append("---\n");
            doc.frontmatter().forEach((k, v) -> appendFrontmatter(sb, k, v));
            sb.append("---\n\n");
        }
        if (doc.title() != null && !doc.title().isBlank()) {
            sb.append("# ").append(doc.title()).append("\n\n");
        }
        List<String> sectionOrder =
                List.of(
                        "Summary",
                        "Facts",
                        "Interpretation",
                        "Relationships",
                        "Related",
                        "Sources",
                        "Open Questions");
        List<String> rendered = new ArrayList<>();
        for (String sec : sectionOrder) {
            if (updatedSections.containsKey(sec)) {
                rendered.add(renderSection(sec, updatedSections.get(sec)));
            }
        }
        for (Map.Entry<String, String> e : updatedSections.entrySet()) {
            if (!sectionOrder.contains(e.getKey())) {
                rendered.add(renderSection(e.getKey(), e.getValue()));
            }
        }
        sb.append(String.join("\n\n", rendered));
        sb.append("\n");
        return sb.toString();
    }

    private void appendFrontmatter(StringBuilder out, String key, Object value) {
        if (value instanceof Iterable<?> items) {
            out.append(key).append(":\n");
            for (Object item : items) {
                out.append("  - ").append(yamlScalar(item)).append("\n");
            }
            return;
        }
        out.append(key).append(": ").append(yamlScalar(value)).append("\n");
    }

    private static String yamlScalar(Object value) {
        if (value == null) return "";
        if (value instanceof String s) {
            return '"' + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + '"';
        }
        return value.toString();
    }

    private static String renderSection(String title, String content) {
        String body = content == null ? "" : content.trim();
        return body.isBlank() ? "## " + title : "## " + title + "\n" + body;
    }

    private void extractBrokenLinks(
            String sourceFile,
            String sectionContent,
            String sourceSection,
            Set<String> validSlugs,
            List<BrokenLinkEntry> broken) {
        for (String line : sectionContent.split("\n")) {
            Matcher m = WIKI_LINK.matcher(line);
            while (m.find()) {
                String slug = m.group(1).trim();
                String alias = m.group(2) != null ? m.group(2).trim() : null;
                if (!isValidSlug(slug, validSlugs)) {
                    broken.add(new BrokenLinkEntry(sourceFile, slug, alias, sourceSection));
                }
            }
        }
    }

    private boolean isValidSlug(String slug, Set<String> validSlugs) {
        String normalizedSlug = normalizeLinkTarget(slug);
        if (normalizedSlug.isEmpty()) {
            // Pure anchor/block reference (e.g. [[#Heading]]) points to the current file
            return true;
        }
        // Match by basename or by relative path (both stored in the index without extension)
        String baseName =
                normalizedSlug.contains("/")
                        ? normalizedSlug.substring(normalizedSlug.lastIndexOf('/') + 1)
                        : normalizedSlug;
        return validSlugs.contains(normalizedSlug) || validSlugs.contains(baseName);
    }

    /**
     * Normalizes a wiki-link target so it can be compared against the slug index. The index stores
     * paths lower-cased and without the {@code .md} extension, so a link may be written with or
     * without the extension, with or without the {@code wiki/...} path, and may carry a heading
     * anchor ({@code #Section}) or block reference ({@code ^block}) that must be ignored when
     * resolving the target file.
     */
    private static String normalizeLinkTarget(String slug) {
        String target = slug.trim();
        // Drop heading anchor / block reference — they point within the target file
        int anchor = target.indexOf('#');
        if (anchor >= 0) {
            target = target.substring(0, anchor);
        }
        int block = target.indexOf('^');
        if (block >= 0) {
            target = target.substring(0, block);
        }
        target = target.trim().replace('\\', '/');
        // Strip trailing .md extension (links may or may not include it)
        String lower = target.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".md")) {
            lower = lower.substring(0, lower.length() - 3);
        }
        return lower;
    }

    private String extractSlugFromLine(String line) {
        Matcher m = WIKI_LINK.matcher(line);
        if (m.find()) {
            return m.group(1).trim();
        }
        return null;
    }

    private Set<String> buildSlugIndex() throws IOException {
        Set<String> slugs = new HashSet<>();
        Path vaultRoot = pathResolver.vaultRoot();
        if (!Files.exists(vaultRoot)) {
            return slugs;
        }
        try (Stream<Path> paths = Files.walk(vaultRoot)) {
            paths.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".md"))
                    .forEach(
                            p -> {
                                String rel = vaultRoot.relativize(p).toString().replace('\\', '/');
                                // strip .md
                                String withoutExt =
                                        rel.endsWith(".md")
                                                ? rel.substring(0, rel.length() - 3)
                                                : rel;
                                String baseName =
                                        withoutExt.contains("/")
                                                ? withoutExt.substring(
                                                        withoutExt.lastIndexOf('/') + 1)
                                                : withoutExt;
                                slugs.add(withoutExt.toLowerCase(Locale.ROOT));
                                slugs.add(baseName.toLowerCase(Locale.ROOT));
                            });
        }
        return slugs;
    }

    private List<Path> collectFiles() throws IOException {
        List<Path> files = new ArrayList<>();
        for (String folder : TARGET_FOLDERS) {
            Path root = pathResolver.resolve(folder);
            if (!Files.exists(root)) {
                continue;
            }
            try (Stream<Path> paths = Files.walk(root)) {
                paths.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().endsWith(".md"))
                        .sorted()
                        .forEach(files::add);
            }
        }
        return files;
    }
}
