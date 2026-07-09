package com.dpswikillm.domain;

import java.time.Instant;
import java.util.Map;

public record NormalizedSourcePayload(
        String sourceId,
        SourceKind sourceKind,
        Instant capturedAt,
        String rawPath,
        String title,
        String content,
        String canonicalUrl,
        String checksum,
        Map<String, Object> metadata,
        LlmSourceNote sourceNote
) {
    public NormalizedSourcePayload withSourceNote(LlmSourceNote note) {
        return new NormalizedSourcePayload(sourceId, sourceKind, capturedAt, rawPath, title, content, canonicalUrl,
                checksum, metadata, note);
    }
}
