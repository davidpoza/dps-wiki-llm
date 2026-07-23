package com.dpswikillm.dto;

import java.util.UUID;

/** A prior version of a single file, used by the editor version-preview control. */
public record FileVersionDto(UUID versionId, String createdAt, String source) {}
