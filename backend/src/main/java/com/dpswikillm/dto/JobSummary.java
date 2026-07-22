package com.dpswikillm.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record JobSummary(
        UUID id,
        String type,
        String status,
        Instant createdAt,
        Instant completedAt,
        String error,
        List<String> affectedPaths,
        List<ConceptProposal> conceptProposals
) {}
