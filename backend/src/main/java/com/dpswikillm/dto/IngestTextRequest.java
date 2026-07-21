package com.dpswikillm.dto;

import com.dpswikillm.domain.JobMode;
import jakarta.validation.constraints.NotBlank;

public record IngestTextRequest(@NotBlank String content, String title, JobMode mode) {}
