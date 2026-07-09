package com.dpswikillm.dto;

import java.util.UUID;

public record EnqueueJobResponse(UUID jobId, int queuePosition) {}
