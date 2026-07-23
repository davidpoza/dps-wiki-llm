package com.dpswikillm.domain;

import java.time.Instant;
import java.util.UUID;

public record DocumentRecord(
        UUID id, String path, String title, String docType, Instant updatedAt, String body) {}
