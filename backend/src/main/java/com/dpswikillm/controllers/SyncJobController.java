package com.dpswikillm.controllers;

import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.services.JobQueueService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/jobs")
public class SyncJobController {

    private final JobQueueService queueService;

    public SyncJobController(JobQueueService queueService) {
        this.queueService = queueService;
    }

    @PostMapping("/sync")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueSync() {
        return queueService.enqueue(JobType.SYNC, JobMode.unattended, null);
    }
}
