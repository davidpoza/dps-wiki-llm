package com.dpswikillm.dto;

import java.time.Instant;

public record EmbeddingStatusResponse(boolean hasEmbedding, Instant lastUpdated) {}
