package com.dpswikillm.dto;

import java.util.List;

public record ConceptDedupGroup(
        String canonicalFilename, List<String> files, double confidence) {}
