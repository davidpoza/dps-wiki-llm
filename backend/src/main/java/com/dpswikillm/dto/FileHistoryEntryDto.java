package com.dpswikillm.dto;

import java.util.UUID;

/** A single per-file change entry in the flat, reverse-chronological history stream. */
public record FileHistoryEntryDto(
        UUID changeId,
        String path,
        String source,
        int linesAdded,
        int linesDeleted,
        String createdAt
) {}
