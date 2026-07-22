package com.dpswikillm.dto;

import com.dpswikillm.domain.MutationPlan;
import java.util.List;

public record ConceptResolutionResult(
        MutationPlan plan,
        List<ConceptProposal> proposals
) {}
