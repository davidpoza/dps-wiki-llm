package com.dpswikillm.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record LoginEventDto(
        UUID id,
        OffsetDateTime createdAt,
        String ipAddress,
        String country,
        String city,
        boolean success,
        String failureReason) {}
