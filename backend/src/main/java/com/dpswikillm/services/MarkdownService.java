package com.dpswikillm.services;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;

@Service
public class MarkdownService {
    private static final List<String> DEFAULT_SECTION_ORDER =
            List.of(
                    "Summary",
                    "Facts",
                    "Interpretation",
                    "Relationships",
                    "Related",
                    "Sources",
                    "Open Questions");

    public MarkdownDocument parse(String markdown) {
        String body = markdown == null ? "" : markdown.replace("\r\n", "\n");
        Map<String, Object> frontmatter = new LinkedHashMap<>();

        if (body.startsWith("---\n")) {
            int end = body.indexOf("\n---\n", 4);
            if (end >= 0) {
                frontmatter.putAll(parseFrontmatter(body.substring(4, end)));
                body = body.substring(end + 5);
            }
        }

        String title = "";
        Map<String, String> sections = new LinkedHashMap<>();
        String currentSection = null;
        List<String> buffer = new ArrayList<>();

        for (String line : body.split("\n", -1)) {
            if (line.startsWith("# ") && title.isBlank()) {
                title = line.substring(2).trim();
                continue;
            }
            if (line.startsWith("## ")) {
                if (currentSection != null) {
                    sections.put(currentSection, trimTrailingBlankLines(buffer));
                }
                currentSection = line.substring(3).trim();
                buffer = new ArrayList<>();
                continue;
            }
            if (currentSection != null) {
                buffer.add(line);
            }
        }

        if (currentSection != null) {
            sections.put(currentSection, trimTrailingBlankLines(buffer));
        }
        return new MarkdownDocument(frontmatter, title, sections);
    }

    public String mergeAndRender(
            String existingMarkdown,
            String fallbackTitle,
            Map<String, Object> frontmatterUpdates,
            Map<String, List<String>> sectionUpdates) {
        MarkdownDocument existing = parse(existingMarkdown);
        Map<String, Object> frontmatter = new LinkedHashMap<>(existing.frontmatter());
        if (frontmatterUpdates != null) {
            frontmatter.putAll(frontmatterUpdates);
        }
        frontmatter.putIfAbsent("updated", LocalDate.now().toString());

        String title = existing.title().isBlank() ? fallbackTitle : existing.title();
        Map<String, String> sections = new LinkedHashMap<>(existing.sections());
        if (sectionUpdates != null) {
            for (Map.Entry<String, List<String>> entry : sectionUpdates.entrySet()) {
                String section = entry.getKey();
                String existingContent = sections.getOrDefault(section, "");
                sections.put(section, mergeSection(existingContent, entry.getValue()));
            }
        }

        return render(frontmatter, title, sections);
    }

    /**
     * Inserts a YAML list ({@code key:} followed by {@code - "value"} lines) into the document's
     * leading frontmatter block, immediately before the closing {@code ---} delimiter. The document
     * body is preserved byte-for-byte; only the new key lines are added. When the document has no
     * frontmatter block, a minimal one is created.
     */
    public String injectFrontmatterList(String markdown, String key, List<String> values) {
        String content = markdown == null ? "" : markdown;
        StringBuilder block = new StringBuilder();
        appendFrontmatter(block, key, values);
        String insertion = block.toString();

        if (content.startsWith("---\n")) {
            int end = content.indexOf("\n---\n", 4);
            if (end >= 0) {
                String before = content.substring(0, end); // "---\n<frontmatter>"
                String after = content.substring(end); // "\n---\n<body>"
                return before + "\n" + insertion.stripTrailing() + after;
            }
        }
        return "---\n" + insertion + "---\n\n" + content;
    }

    private String render(
            Map<String, Object> frontmatter, String title, Map<String, String> sections) {
        StringBuilder out = new StringBuilder();
        if (!frontmatter.isEmpty()) {
            out.append("---\n");
            frontmatter.forEach((key, value) -> appendFrontmatter(out, key, value));
            out.append("---\n\n");
        }
        out.append("# ")
                .append(title == null || title.isBlank() ? "Untitled" : title.trim())
                .append("\n\n");

        List<String> rendered = new ArrayList<>();
        for (String section : DEFAULT_SECTION_ORDER) {
            if (sections.containsKey(section)) {
                rendered.add(renderSection(section, sections.get(section)));
            }
        }
        for (Map.Entry<String, String> entry : sections.entrySet()) {
            if (!DEFAULT_SECTION_ORDER.contains(entry.getKey())) {
                rendered.add(renderSection(entry.getKey(), entry.getValue()));
            }
        }
        out.append(String.join("\n\n", rendered));
        out.append("\n");
        return out.toString();
    }

    private String mergeSection(String existingContent, List<String> additions) {
        List<String> existingLines = splitNonBlank(existingContent);
        List<String> merged = new ArrayList<>(existingLines);
        List<String> seen =
                existingLines.stream()
                        .map(this::dedupeKey)
                        .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
        for (String addition : additions == null ? List.<String>of() : additions) {
            String normalized = normalizeAddition(addition);
            if (normalized.isBlank()) {
                continue;
            }
            String key = dedupeKey(normalized);
            if (!seen.contains(key)) {
                seen.add(key);
                merged.add(normalized);
            }
        }
        return String.join("\n", merged).trim();
    }

    private List<String> splitNonBlank(String content) {
        List<String> lines = new ArrayList<>();
        for (String line : Objects.toString(content, "").split("\n")) {
            if (!line.trim().isBlank()) {
                lines.add(line.trim());
            }
        }
        return lines;
    }

    private String normalizeAddition(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.startsWith("- ") || trimmed.isBlank()) {
            return trimmed;
        }
        return "- " + trimmed;
    }

    private String dedupeKey(String value) {
        return value.replaceFirst("^-\\s*", "")
                .replaceAll("\\s+", " ")
                .trim()
                .toLowerCase(Locale.ROOT);
    }

    private Map<String, Object> parseFrontmatter(String raw) {
        Map<String, Object> values = new LinkedHashMap<>();
        String pendingListKey = null;
        List<String> pendingList = null;
        for (String line : raw.split("\n")) {
            if (line.isBlank()) {
                if (pendingListKey != null) {
                    values.put(pendingListKey, new ArrayList<>(pendingList));
                    pendingListKey = null;
                    pendingList = null;
                }
                continue;
            }
            // YAML list item
            if (line.startsWith("  - ") || line.startsWith("- ")) {
                if (pendingListKey != null) {
                    pendingList.add(unquoteYamlScalar(line.replaceFirst("^\\s*-\\s+", "")));
                }
                continue;
            }
            // Flush pending list when a non-item line is encountered
            if (pendingListKey != null) {
                values.put(pendingListKey, new ArrayList<>(pendingList));
                pendingListKey = null;
                pendingList = null;
            }
            int separator = line.indexOf(':');
            if (separator <= 0) {
                continue;
            }
            String key = line.substring(0, separator).trim();
            String valueStr = line.substring(separator + 1).trim();
            if (valueStr.isEmpty()) {
                pendingListKey = key;
                pendingList = new ArrayList<>();
            } else {
                values.put(key, unquoteYamlScalar(valueStr));
            }
        }
        if (pendingListKey != null) {
            values.put(pendingListKey, new ArrayList<>(pendingList));
        }
        return values;
    }

    private static String unquoteYamlScalar(String raw) {
        if (raw.startsWith("\"") && raw.endsWith("\"") && raw.length() >= 2) {
            return raw.substring(1, raw.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\");
        }
        return raw;
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

    private String renderSection(String title, String content) {
        String body = content == null ? "" : content.trim();
        return body.isBlank() ? "## " + title : "## " + title + "\n" + body;
    }

    private String trimTrailingBlankLines(List<String> lines) {
        int end = lines.size();
        while (end > 0 && lines.get(end - 1).isBlank()) {
            end -= 1;
        }
        return String.join("\n", lines.subList(0, end)).trim();
    }
}
