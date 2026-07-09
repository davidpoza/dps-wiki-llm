package com.dpswikillm.controllers;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.dto.EnqueueJobRequest;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.dto.ReviewRequest;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.services.FileLookupService;
import com.dpswikillm.services.GuidedReviewService;
import com.dpswikillm.services.JobEventService;
import com.dpswikillm.services.JobQueueService;
import com.dpswikillm.services.RawIntakeService;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class JobController {
    private final JobEventService eventService;
    private final JobQueueService queueService;
    private final JobRepository jobRepository;
    private final RawIntakeService rawIntakeService;
    private final GuidedReviewService guidedReviewService;
    private final FileLookupService fileLookupService;

    public JobController(JobEventService eventService, JobQueueService queueService, JobRepository jobRepository,
                         RawIntakeService rawIntakeService, GuidedReviewService guidedReviewService,
                         FileLookupService fileLookupService) {
        this.eventService = eventService;
        this.queueService = queueService;
        this.jobRepository = jobRepository;
        this.rawIntakeService = rawIntakeService;
        this.guidedReviewService = guidedReviewService;
        this.fileLookupService = fileLookupService;
    }

    @GetMapping("/jobs/events")
    public SseEmitter events() {
        return eventService.subscribe();
    }

    @GetMapping("/jobs/{id}")
    public Job getJob(@PathVariable UUID id) {
        return jobRepository.findById(id).orElseThrow();
    }

    @PostMapping("/ingest")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueIngest(@Valid @RequestBody EnqueueJobRequest request) throws IOException {
        String payloadRef = request.payloadRef();
        if (payloadRef == null && request.url() != null) {
            payloadRef = rawIntakeService.ingestUrl(request.url());
        }
        return queueService.enqueue(JobType.INGEST, request.mode() == null ? JobMode.unattended : request.mode(), payloadRef);
    }

    @PostMapping(value = "/ingest/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueMarkdownUpload(@RequestParam("file") MultipartFile file,
                                                    @RequestParam(value = "mode", required = false) JobMode mode) throws IOException {
        return queueService.enqueue(JobType.INGEST, mode == null ? JobMode.unattended : mode, rawIntakeService.ingestMarkdown(file));
    }

    @PostMapping("/answer")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueAnswer(@Valid @RequestBody EnqueueJobRequest request) {
        return queueService.enqueue(JobType.ANSWER, JobMode.unattended, request.question());
    }

    @PostMapping("/jobs/{id}/revert")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueRevert(@PathVariable UUID id) {
        return queueService.enqueue(JobType.REVERT, JobMode.unattended, id.toString());
    }

    @GetMapping("/jobs/{id}/review")
    public java.util.List<JobConnectionCandidate> reviewCandidates(@PathVariable UUID id) {
        return guidedReviewService.candidatesForJob(id);
    }

    @PostMapping("/jobs/{id}/review")
    public Object submitReview(@PathVariable UUID id, @RequestBody ReviewRequest request) throws Exception {
        return guidedReviewService.review(id, request);
    }

    @GetMapping("/files/lookup")
    public java.util.List<SearchResult> lookupFiles(@RequestParam("q") String query,
                                                    @RequestParam(value = "limit", defaultValue = "10") int limit) {
        return fileLookupService.lookup(query, limit);
    }
}
