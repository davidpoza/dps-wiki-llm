package com.dpswikillm.domain;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonProperty;

public record MutationPlan(@JsonProperty("plan_id") String planId,
                           @JsonProperty("page_actions") List<MutationAction> pageActions) {}
