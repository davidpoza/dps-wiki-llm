package com.dpswikillm.services;

import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.SourceKind;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class SourceNormalizer {
    private final VaultPathResolver pathResolver;

    public SourceNormalizer(VaultPathResolver pathResolver) {
        this.pathResolver = pathResolver;
    }

    public NormalizedSourcePayload normalize(String rawPath) throws IOException {
        String normalized = pathResolver.normalizeRelativePath(rawPath);
        if (!normalized.startsWith("raw/")) {
            throw new IllegalArgumentException("Ingest source must be under raw/**: " + normalized);
        }
        Path path = pathResolver.resolve(normalized);
        String content = Files.readString(path, StandardCharsets.UTF_8);
        String checksum = TextUtil.sha256(content);
        SourceKind kind = inferKind(normalized);

        Map<String, String> frontmatter = parseFrontmatter(content);
        String body = stripFrontmatter(content);

        String fallbackTitle = path.getFileName().toString().replaceFirst("\\.[^.]+$", "");
        String title = frontmatter.getOrDefault("title", null);
        if (title == null || title.isBlank()) {
            title = TextUtil.firstHeadingOrFilename(body, fallbackTitle);
        }

        String canonicalUrl = canonicalUrl(frontmatter, content);
        String sourceId = kind + ":" + checksum.substring(0, 16);

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("raw_size", content.length());
        frontmatter.forEach(metadata::putIfAbsent);

        return new NormalizedSourcePayload(sourceId, kind, Instant.now(), normalized, title, content,
                canonicalUrl, checksum, metadata, null);
    }

    private SourceKind inferKind(String path) {
        if (path.startsWith("raw/web/")) {
            return SourceKind.web;
        }
        if (path.startsWith("raw/bookmarks/")) {
            return SourceKind.bookmark;
        }
        if (path.startsWith("raw/voice/")) {
            return SourceKind.voice;
        }
        if (path.startsWith("raw/inbox/")) {
            return SourceKind.note;
        }
        return SourceKind.other;
    }

    private String canonicalUrl(Map<String, String> frontmatter, String content) {
        String canonical = frontmatter.get("canonical_url");
        if (canonical != null && !canonical.isBlank()) {
            return canonical;
        }
        String source = frontmatter.get("source_url");
        if (source != null && !source.isBlank()) {
            return source;
        }
        // Legacy fallback: pre-migration raw/web files used a "Source URL:" line.
        for (String line : content.split("\n")) {
            if (line.startsWith("Source URL:")) {
                return line.substring("Source URL:".length()).trim();
            }
        }
        return null;
    }

    /**
     * Parse a leading YAML frontmatter block ({@code ---} … {@code ---}) into a
     * flat key/value map. Only the simple {@code key: value} form is supported,
     * with optional double-quoted values (as written by {@link RawIntakeService}).
     */
    static Map<String, String> parseFrontmatter(String content) {
        Map<String, String> fields = new LinkedHashMap<>();
        if (content == null || !content.startsWith("---")) {
            return fields;
        }
        String[] lines = content.split("\n");
        if (lines.length == 0 || !lines[0].trim().equals("---")) {
            return fields;
        }
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i];
            if (line.trim().equals("---")) {
                break;
            }
            int colon = line.indexOf(':');
            if (colon <= 0) {
                continue;
            }
            String key = line.substring(0, colon).trim();
            String value = line.substring(colon + 1).trim();
            fields.put(key, unquote(value));
        }
        return fields;
    }

    private static String stripFrontmatter(String content) {
        if (content == null || !content.startsWith("---")) {
            return content == null ? "" : content;
        }
        int firstNewline = content.indexOf('\n');
        if (firstNewline < 0) {
            return content;
        }
        int end = content.indexOf("\n---", firstNewline);
        if (end < 0) {
            return content;
        }
        int after = content.indexOf('\n', end + 1);
        return after < 0 ? "" : content.substring(after + 1);
    }

    private static String unquote(String value) {
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1)
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
        }
        return value;
    }
}
