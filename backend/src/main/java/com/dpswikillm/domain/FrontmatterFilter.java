package com.dpswikillm.domain;

import java.util.List;
import java.util.Optional;

/**
 * A single Obsidian-style frontmatter property filter parsed from the {@code [key: value]} search
 * syntax. Matching is partial and case/accent-insensitive; see {@code JdbcDocumentIndexRepository}.
 */
public record FrontmatterFilter(String key, String value) {

    /**
     * Parse a raw {@code fm} request token of the form {@code key:value} into a filter. The split
     * happens on the first {@code ':'} so values may contain colons. Returns empty when the token
     * has no key or value.
     */
    public static Optional<FrontmatterFilter> parse(String token) {
        if (token == null) {
            return Optional.empty();
        }
        int separator = token.indexOf(':');
        if (separator <= 0) {
            return Optional.empty();
        }
        String key = token.substring(0, separator).trim();
        String value = token.substring(separator + 1).trim();
        if (key.isEmpty() || value.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new FrontmatterFilter(key, value));
    }

    /** Parse and collect the valid filters from a list of raw {@code fm} tokens. */
    public static List<FrontmatterFilter> parseAll(List<String> tokens) {
        if (tokens == null || tokens.isEmpty()) {
            return List.of();
        }
        return tokens.stream().map(FrontmatterFilter::parse).flatMap(Optional::stream).toList();
    }
}
