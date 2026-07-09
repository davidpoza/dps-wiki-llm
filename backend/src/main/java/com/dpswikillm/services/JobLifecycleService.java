package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.dto.JobEvent;
import com.dpswikillm.repositories.JobRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JobLifecycleService {
    private final JobRepository jobRepository;
    private final JobEventService eventService;

    public JobLifecycleService(JobRepository jobRepository, JobEventService eventService) {
        this.jobRepository = jobRepository;
        this.eventService = eventService;
    }

    @Transactional
    public Job transition(UUID jobId, JobStatus status, String step, String message) {
        Job job = jobRepository.findById(jobId).orElseThrow();
        job.transitionTo(status);
        if (status == JobStatus.FAILED) {
            job.setError(message);
        }
        if (status == JobStatus.COMPLETED) {
            job.setResult(message == null ? "{}" : "{\"message\":\"" + escapeJson(message) + "\"}");
        }
        Job saved = jobRepository.save(job);
        eventService.broadcast(new JobEvent(status, saved.getId(), saved.getType(), saved.getQueuePosition(),
                step, null, null, message, saved.getResult()));
        return saved;
    }

    public void fileEvent(Job job, String path, String action) {
        eventService.broadcast(new JobEvent(JobStatus.PROGRESS, job.getId(), job.getType(), job.getQueuePosition(),
                "file", path, action, null, null));
    }

    public void progress(Job job, String step, String message, String result) {
        eventService.broadcast(new JobEvent(JobStatus.PROGRESS, job.getId(), job.getType(), job.getQueuePosition(),
                step, null, null, message, result));
    }

    public void awaitingReview(Job job, String message, String result) {
        eventService.broadcast(new JobEvent(JobStatus.AWAITING_REVIEW, job.getId(), job.getType(), job.getQueuePosition(),
                "awaiting-review", null, null, message, result));
    }

    private String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
