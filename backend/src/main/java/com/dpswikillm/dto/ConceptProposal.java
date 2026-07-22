package com.dpswikillm.dto;

public record ConceptProposal(
        String proposedPath,
        String proposedTitle,
        boolean deduplicated,
        String resolvedPath
) {}
