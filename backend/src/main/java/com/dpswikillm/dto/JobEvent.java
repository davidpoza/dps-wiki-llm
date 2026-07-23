package com.dpswikillm.dto;

import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import java.util.UUID;

public record JobEvent(
        JobStatus type,
        UUID jobId,
        JobType jobType,
        Integer queuePosition,
        String step,
        String path,
        String action,
        String message,
        String result) {}
