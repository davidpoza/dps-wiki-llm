package com.dpswikillm.dto;

import java.time.OffsetDateTime;

public record LlmPromptDto(String key, String name, String text, OffsetDateTime updatedAt) {}
