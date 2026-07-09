package com.dpswikillm.services;

import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.SourceKind;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
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
        String fallbackTitle = path.getFileName().toString().replaceFirst("\\.[^.]+$", "");
        String title = TextUtil.firstHeadingOrFilename(content, fallbackTitle);
        String sourceId = kind + ":" + checksum.substring(0, 16);
        return new NormalizedSourcePayload(sourceId, kind, Instant.now(), normalized, title, content,
                canonicalUrl(content), checksum, Map.of("raw_size", content.length()), null);
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

    private String canonicalUrl(String content) {
        for (String line : content.split("\n")) {
            if (line.startsWith("Source URL:")) {
                return line.substring("Source URL:".length()).trim();
            }
        }
        return null;
    }
}
