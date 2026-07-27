package com.dpswikillm.dto;

import java.util.List;

/** Summary returned by a WebDAV sync run. */
public record SyncResultDto(
        List<String> pulled, List<String> deleted, List<String> pushed, List<String> conflicts) {}
