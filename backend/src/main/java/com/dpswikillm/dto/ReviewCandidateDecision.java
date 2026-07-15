package com.dpswikillm.dto;

import com.dpswikillm.domain.ConnectionCandidateDecision;
import java.util.UUID;

public record ReviewCandidateDecision(UUID candidateId, ConnectionCandidateDecision decision) {}
