package com.dpswikillm.dto;

/** Request body for resolving a conflict: keep is "LOCAL", "REMOTE", "SKIP", or "MANUAL". */
public record ConflictResolveRequest(String path, String keep, String content) {}
