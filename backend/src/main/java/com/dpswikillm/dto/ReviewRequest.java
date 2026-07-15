package com.dpswikillm.dto;

import java.util.List;

public record ReviewRequest(List<ReviewCandidateDecision> candidates, List<String> manualTargetPaths) {}
