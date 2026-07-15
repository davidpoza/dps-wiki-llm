package com.dpswikillm.domain;

import java.util.List;

public record GuardrailResult(MutationPlan plan, List<String> rejections) {}
