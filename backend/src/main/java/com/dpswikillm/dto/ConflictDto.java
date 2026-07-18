package com.dpswikillm.dto;

/** An unresolved WebDAV sync conflict, with both sides for side-by-side display. */
public record ConflictDto(
        String path,
        String localContent,
        String remoteContent
) {}
