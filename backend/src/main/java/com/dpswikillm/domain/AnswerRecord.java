package com.dpswikillm.domain;

import java.util.List;

public record AnswerRecord(
        String question,
        String answer,
        List<String> evidencePaths,
        String artifactPath,
        boolean shouldReviewForFeedback) {}
