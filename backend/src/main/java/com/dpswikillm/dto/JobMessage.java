package com.dpswikillm.dto;

import com.dpswikillm.domain.JobType;
import java.util.UUID;

public record JobMessage(UUID jobId, JobType jobType) {}
