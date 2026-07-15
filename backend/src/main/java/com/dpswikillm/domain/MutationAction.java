package com.dpswikillm.domain;

import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.annotation.JsonProperty;

public record MutationAction(
        MutationActionType action,
        String path,
        String title,
        Map<String, Object> frontmatter,
        Map<String, List<String>> sections,
        @JsonProperty("idempotency_key") String idempotencyKey
) {}
