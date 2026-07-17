package com.dpswikillm.dto;

import java.util.List;
import java.util.UUID;

public record SnapshotDto(
        UUID id,
        String operationType,
        String message,
        String createdAt,
        List<SnapshotFileStatDto> files
) {}
