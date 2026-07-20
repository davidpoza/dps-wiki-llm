package com.dpswikillm.domain;

import java.util.List;

public record LlmSourceNote(
        String summary,
        String rawContext,
        List<String> extractedClaims,
        List<String> openQuestions,
        String generatedBy,
        String model,
        List<String> keywords
) {}
