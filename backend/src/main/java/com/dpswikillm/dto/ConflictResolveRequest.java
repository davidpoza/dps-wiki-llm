package com.dpswikillm.dto;

/** Request body for resolving a conflict: keep is "LOCAL" or "REMOTE". */
public record ConflictResolveRequest(String path, String keep) {}
