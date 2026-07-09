package com.dpswikillm.domain;

import java.util.List;
import java.util.Map;

public record OperationCommitRequest(
        String operationType,
        String jobId,
        String message,
        List<String> affectedPaths,
        Map<String, Object> metadata
) {}
