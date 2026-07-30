package com.dpswikillm.services;

import com.dpswikillm.domain.DocumentRecord;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

/**
 * Single source of truth for turning a wiki markdown file into a {@link DocumentRecord}. Shared by
 * the bulk reindex ({@link ReindexService}) and the incremental per-note index ({@link
 * DocumentIndexService}) so both derive title, doc type, and id identically.
 */
final class WikiDocumentReader {
    private WikiDocumentReader() {}

    static DocumentRecord read(Path vaultRoot, MarkdownService markdownService, Path file) {
        try {
            String relativePath =
                    vaultRoot
                            .relativize(file.toAbsolutePath().normalize())
                            .toString()
                            .replace('\\', '/');
            if (!relativePath.startsWith("wiki/")) {
                throw new IllegalArgumentException(
                        "Only wiki paths can be indexed: " + relativePath);
            }
            String body = Files.readString(file, StandardCharsets.UTF_8);
            MarkdownDocument markdown = markdownService.parse(body);
            Object frontmatterType = markdown.frontmatter().get("type");
            String docType =
                    frontmatterType == null || frontmatterType.toString().isBlank()
                            ? inferDocType(relativePath)
                            : frontmatterType.toString();
            String title =
                    markdown.title().isBlank() ? titleFromPath(relativePath) : markdown.title();
            Instant updated = Files.getLastModifiedTime(file).toInstant();
            return new DocumentRecord(
                    UUID.nameUUIDFromBytes(relativePath.getBytes(StandardCharsets.UTF_8)),
                    relativePath,
                    title,
                    docType,
                    updated,
                    body);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read markdown document: " + file, ex);
        }
    }

    private static String inferDocType(String path) {
        String[] parts = path.split("/");
        return parts.length > 1 ? parts[1].replaceAll("s$", "") : "note";
    }

    private static String titleFromPath(String path) {
        String file = Path.of(path).getFileName().toString().replaceFirst("\\.md$", "");
        String[] words = file.split("-");
        StringBuilder title = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) {
                continue;
            }
            if (!title.isEmpty()) {
                title.append(' ');
            }
            title.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return title.toString();
    }
}
