package com.dpswikillm.dto;

import com.dpswikillm.domain.JobMode;

public record EnqueueJobRequest(String payloadRef, JobMode mode, String question, String url) {}
