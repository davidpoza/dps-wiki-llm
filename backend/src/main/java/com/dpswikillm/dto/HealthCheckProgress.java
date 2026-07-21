package com.dpswikillm.dto;

/**
 * Progress of the manual vault health-check. {@code phase} is either
 * {@code "embeddings"} (phase 1) or {@code "connections"} (phase 2); {@code processed}/{@code total}
 * describe the current phase so the frontend can render a percentage. {@code embeddingsBuilt} and
 * {@code connectionsFound} carry the running aggregate reported on completion.
 */
public record HealthCheckProgress(String phase, int processed, int total, int embeddingsBuilt, int connectionsFound) {}
