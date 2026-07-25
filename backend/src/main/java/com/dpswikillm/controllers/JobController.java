package com.dpswikillm.controllers;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ConceptProposal;
import com.dpswikillm.dto.EnqueueJobRequest;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.dto.FileEventDto;
import com.dpswikillm.dto.IngestTextRequest;
import com.dpswikillm.dto.JobSummary;
import com.dpswikillm.dto.ReviewRequest;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.services.FileLookupService;
import com.dpswikillm.services.FileService;
import com.dpswikillm.services.GuidedReviewService;
import com.dpswikillm.services.JobEventService;
import com.dpswikillm.services.JobLifecycleService;
import com.dpswikillm.services.JobQueueService;
import com.dpswikillm.services.LinkDiscoveryService;
import com.dpswikillm.services.RawIntakeService;
import com.dpswikillm.services.SnapshotService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
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
    private final JobLifecycleService lifecycleService;
    private final JobRepository jobRepository;
    private final RawIntakeService rawIntakeService;
    private final GuidedReviewService guidedReviewService;
    private final FileLookupService fileLookupService;
    private final LinkDiscoveryService linkDiscoveryService;
    private final SnapshotService snapshotService;
    private final ObjectMapper objectMapper;
    private final FileService fileService;

    public JobController(
            JobEventService eventService,
            JobQueueService queueService,
            JobLifecycleService lifecycleService,
            JobRepository jobRepository,
            RawIntakeService rawIntakeService,
            GuidedReviewService guidedReviewService,
            FileLookupService fileLookupService,
            LinkDiscoveryService linkDiscoveryService,
            SnapshotService snapshotService,
            ObjectMapper objectMapper,
            FileService fileService) {
        this.eventService = eventService;
        this.queueService = queueService;
        this.lifecycleService = lifecycleService;
        this.jobRepository = jobRepository;
        this.rawIntakeService = rawIntakeService;
        this.guidedReviewService = guidedReviewService;
        this.fileLookupService = fileLookupService;
        this.linkDiscoveryService = linkDiscoveryService;
        this.snapshotService = snapshotService;
        this.objectMapper = objectMapper;
        this.fileService = fileService;
    }

    @GetMapping("/jobs/events")
    public SseEmitter events() {
        return eventService.subscribe();
    }

    @GetMapping("/jobs")
    public java.util.List<JobSummary> listJobs() {
        return jobRepository.findTop50ByOrderByCreatedAtDesc().stream()
                .map(
                        j ->
                                new JobSummary(
                                        j.getId(),
                                        j.getType().name(),
                                        j.getStatus().name(),
                                        j.getCreatedAt(),
                                        j.getCompletedAt(),
                                        j.getError(),
                                        parseAffectedPaths(j),
                                        parseConceptProposals(j),
                                        buildFileEvents(j)))
                .toList();
    }

    private List<FileEventDto> buildFileEvents(Job job) {
        if (job.getSnapshotId() == null) return List.of();
        return snapshotService.getSnapshotFiles(job.getSnapshotId()).stream()
                .map(
                        sf ->
                                new FileEventDto(
                                        sf.getPath(),
                                        sf.getContentAfter() == null ? "delete" : "update"))
                .toList();
    }

    private List<String> parseAffectedPaths(Job job) {
        String raw = job.getAffectedPaths();
        if (raw == null || raw.isBlank()) return List.of();
        try {
            return objectMapper.readValue(raw, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private List<ConceptProposal> parseConceptProposals(Job job) {
        String raw = job.getConceptProposals();
        if (raw == null || raw.isBlank()) return List.of();
        try {
            return objectMapper.readValue(raw, new TypeReference<List<ConceptProposal>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    @GetMapping("/jobs/{id}")
    public Job getJob(@PathVariable UUID id) {
        return jobRepository.findById(id).orElseThrow();
    }

    @DeleteMapping("/jobs/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelJob(@PathVariable UUID id) {
        lifecycleService.cancelJob(id);
    }

    @PostMapping("/jobs/{id}/abandon")
    @ResponseStatus(HttpStatus.OK)
    public void abandonJob(@PathVariable UUID id) {
        lifecycleService.abandonJob(id);
    }

    @PostMapping("/ingest")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueIngest(@Valid @RequestBody EnqueueJobRequest request)
            throws IOException {
        String payloadRef = request.payloadRef();
        if (payloadRef == null && request.url() != null) {
            payloadRef = rawIntakeService.ingestUrl(request.url());
        }
        return queueService.enqueue(
                JobType.INGEST,
                request.mode() == null ? JobMode.unattended : request.mode(),
                payloadRef);
    }

    @PostMapping(value = "/ingest/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueMarkdownUpload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "mode", required = false) JobMode mode)
            throws IOException {
        return queueService.enqueue(
                JobType.INGEST,
                mode == null ? JobMode.unattended : mode,
                rawIntakeService.ingestFile(file));
    }

    @PostMapping("/ingest/text")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueIngestText(@Valid @RequestBody IngestTextRequest request)
            throws IOException {
        return queueService.enqueue(
                JobType.INGEST,
                request.mode() == null ? JobMode.unattended : request.mode(),
                rawIntakeService.ingestText(request.content(), request.title()));
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

    @PostMapping("/jobs/enrich")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueEnrich(@RequestParam("path") String path) {
        return queueService.enqueue(JobType.ENRICH, JobMode.unattended, path);
    }

    @PostMapping("/jobs/rename")
    public org.springframework.http.ResponseEntity<EnqueueJobResponse> enqueueRename(
            @RequestParam("path") String path, @RequestParam("newName") String newName)
            throws com.fasterxml.jackson.core.JsonProcessingException {
        try {
            fileService.validateRenameTarget(path, newName);
        } catch (FileService.NoSuchFileException e) {
            return org.springframework.http.ResponseEntity.notFound().build();
        } catch (FileService.FileAlreadyExistsException e) {
            return org.springframework.http.ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        String payload =
                objectMapper.writeValueAsString(java.util.Map.of("path", path, "newName", newName));
        EnqueueJobResponse response =
                queueService.enqueue(JobType.RENAME, JobMode.unattended, payload);
        return org.springframework.http.ResponseEntity.accepted().body(response);
    }

    @GetMapping("/jobs/{id}/review")
    public java.util.List<JobConnectionCandidate> reviewCandidates(@PathVariable UUID id) {
        return guidedReviewService.candidatesForJob(id);
    }

    @PostMapping("/jobs/{id}/review")
    public Object submitReview(@PathVariable UUID id, @RequestBody ReviewRequest request)
            throws Exception {
        return guidedReviewService.review(id, request);
    }

    @GetMapping("/files/lookup")
    public java.util.List<SearchResult> lookupFiles(
            @RequestParam("q") String query,
            @RequestParam(value = "limit", defaultValue = "10") int limit) {
        return fileLookupService.lookup(query, limit);
    }

    @GetMapping(value = "/jobs/link-discovery-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter linkDiscoveryStream(@RequestParam("path") String path) {
        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(
                () -> {
                    try {
                        java.util.List<LinkDiscoveryService.DiscoveredLink> results =
                                linkDiscoveryService.discover(
                                        path,
                                        progress -> {
                                            try {
                                                emitter.send(
                                                        SseEmitter.event()
                                                                .name("progress")
                                                                .data(progress));
                                            } catch (java.io.IOException
                                                    | IllegalStateException ex) {
                                                throw new IllegalStateException(
                                                        "SSE send failed", ex);
                                            }
                                        });
                        emitter.send(SseEmitter.event().name("done").data(results));
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(new ErrorPayload(ex.getMessage())));
                        } catch (java.io.IOException | IllegalStateException ignored) {
                        }
                        emitter.complete();
                    }
                });
        return emitter;
    }

    private record ErrorPayload(String message) {}
}
