package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.dto.ConceptProposal;
import com.dpswikillm.dto.JobEvent;
import com.dpswikillm.repositories.JobRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class JobLifecycleService {
    private static final Logger log = LoggerFactory.getLogger(JobLifecycleService.class);
    private final JobRepository jobRepository;
    private final JobEventService eventService;
    private final ObjectMapper objectMapper;

    public JobLifecycleService(
            JobRepository jobRepository, JobEventService eventService, ObjectMapper objectMapper) {
        this.jobRepository = jobRepository;
        this.eventService = eventService;
        this.objectMapper = objectMapper;
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
        eventService.broadcast(
                new JobEvent(
                        status,
                        saved.getId(),
                        saved.getType(),
                        saved.getQueuePosition(),
                        step,
                        null,
                        null,
                        message,
                        saved.getResult()));
        return saved;
    }

    public void fileEvent(Job job, String path, String action) {
        eventService.broadcast(
                new JobEvent(
                        JobStatus.PROGRESS,
                        job.getId(),
                        job.getType(),
                        job.getQueuePosition(),
                        "file",
                        path,
                        action,
                        null,
                        null));
    }

    public void progress(Job job, String step, String message, String result) {
        eventService.broadcast(
                new JobEvent(
                        JobStatus.PROGRESS,
                        job.getId(),
                        job.getType(),
                        job.getQueuePosition(),
                        step,
                        null,
                        null,
                        message,
                        result));
    }

    public void awaitingReview(Job job, String message, String result) {
        eventService.broadcast(
                new JobEvent(
                        JobStatus.AWAITING_REVIEW,
                        job.getId(),
                        job.getType(),
                        job.getQueuePosition(),
                        "awaiting-review",
                        null,
                        null,
                        message,
                        result));
    }

    @Transactional
    public void conceptProposals(Job job, List<ConceptProposal> proposals) {
        log.info(
                "Job {}: {} concept proposal(s) to store and broadcast",
                job.getId(),
                proposals.size());
        try {
            job.setConceptProposals(objectMapper.writeValueAsString(proposals));
        } catch (JsonProcessingException e) {
            log.warn(
                    "Failed to serialize concept proposals for job {}: {}",
                    job.getId(),
                    e.getMessage());
            job.setConceptProposals("[]");
        }
        jobRepository.save(job);
        for (ConceptProposal proposal : proposals) {
            String result;
            try {
                result = objectMapper.writeValueAsString(proposal);
            } catch (JsonProcessingException e) {
                result = "{}";
            }
            eventService.broadcast(
                    new JobEvent(
                            JobStatus.PROGRESS,
                            job.getId(),
                            job.getType(),
                            job.getQueuePosition(),
                            "concept-proposal",
                            null,
                            null,
                            proposal.proposedTitle(),
                            result));
        }
    }

    @Transactional
    public void abandonJob(UUID jobId) {
        Job job =
                jobRepository
                        .findById(jobId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (job.getStatus() != JobStatus.PROGRESS && job.getStatus() != JobStatus.STARTED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Job cannot be abandoned in its current state");
        }
        transition(jobId, JobStatus.FAILED, "abandoned", "Abandoned by user");
    }

    @Transactional
    public void cancelJob(UUID jobId) {
        Job job =
                jobRepository
                        .findById(jobId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (job.getStatus() != JobStatus.QUEUED && job.getStatus() != JobStatus.AWAITING_REVIEW) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Job cannot be cancelled in its current state");
        }
        job.transitionTo(JobStatus.CANCELLED);
        Job saved = jobRepository.save(job);
        eventService.broadcast(
                new JobEvent(
                        JobStatus.CANCELLED,
                        saved.getId(),
                        saved.getType(),
                        saved.getQueuePosition(),
                        "cancelled",
                        null,
                        null,
                        null,
                        null));
    }

    private String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
