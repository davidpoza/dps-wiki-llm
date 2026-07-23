package com.dpswikillm.domain;

import java.util.ArrayList;
import java.util.List;

public record MutationResult(
        String planId,
        List<String> created,
        List<String> updated,
        List<String> skipped,
        List<String> idempotentHits) {
    public static MutationResult empty(String planId) {
        return new MutationResult(
                planId, new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>());
    }
}
