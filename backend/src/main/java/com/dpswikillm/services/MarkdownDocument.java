package com.dpswikillm.services;

import java.util.LinkedHashMap;
import java.util.Map;

public record MarkdownDocument(
        Map<String, Object> frontmatter, String title, Map<String, String> sections) {
    public MarkdownDocument {
        frontmatter =
                frontmatter == null ? new LinkedHashMap<>() : new LinkedHashMap<>(frontmatter);
        sections = sections == null ? new LinkedHashMap<>() : new LinkedHashMap<>(sections);
    }
}
