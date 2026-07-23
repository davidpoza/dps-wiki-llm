package com.dpswikillm.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record MutationPlan(
        @JsonProperty("plan_id") String planId,
        @JsonProperty("page_actions") List<MutationAction> pageActions) {}
