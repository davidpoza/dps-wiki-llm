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
    private static final List<String> DEFAULT_SECTION_ORDER = List.of(
            "Summary", "Facts", "Interpretation", "Relationships", "Related", "Sources", "Open Questions");

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

    public String mergeAndRender(String existingMarkdown, String fallbackTitle, Map<String, Object> frontmatterUpdates,
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

    private String render(Map<String, Object> frontmatter, String title, Map<String, String> sections) {
        StringBuilder out = new StringBuilder();
        if (!frontmatter.isEmpty()) {
            out.append("---\n");
            frontmatter.forEach((key, value) -> appendFrontmatter(out, key, value));
            out.append("---\n\n");
        }
        out.append("# ").append(title == null || title.isBlank() ? "Untitled" : title.trim()).append("\n\n");

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
        List<String> seen = existingLines.stream().map(this::dedupeKey).collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
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
        return value.replaceFirst("^-\\s*", "").replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
    }

    private Map<String, Object> parseFrontmatter(String raw) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (String line : raw.split("\n")) {
            if (line.isBlank() || line.startsWith(" ") || line.trim().startsWith("- ")) {
                continue;
            }
            int separator = line.indexOf(':');
            if (separator <= 0) {
                continue;
            }
            values.put(line.substring(0, separator).trim(), line.substring(separator + 1).trim());
        }
        return values;
    }

    private void appendFrontmatter(StringBuilder out, String key, Object value) {
        if (value instanceof Iterable<?> items) {
            out.append(key).append(":\n");
            for (Object item : items) {
                out.append("  - ").append(item).append("\n");
            }
            return;
        }
        out.append(key).append(": ").append(value == null ? "" : value).append("\n");
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
