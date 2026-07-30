package com.dpswikillm.domain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public record DocumentRecord(
        UUID id,
        String path,
        String title,
        String docType,
        Instant updatedAt,
        String body,
        Map<String, Object> frontmatter) {
    public DocumentRecord {
        frontmatter =
                frontmatter == null ? new LinkedHashMap<>() : new LinkedHashMap<>(frontmatter);
    }
}
