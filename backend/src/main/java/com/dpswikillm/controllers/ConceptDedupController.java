package com.dpswikillm.controllers;

import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.dto.ConceptDedupGroup;
import com.dpswikillm.dto.ConceptMergeRequest;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.services.ConceptDedupScanService;
import com.dpswikillm.services.ConceptDedupScanService.ScanProgress;
import com.dpswikillm.services.JobQueueService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/concept-dedup")
public class ConceptDedupController {
    private static final Logger log = LoggerFactory.getLogger(ConceptDedupController.class);

    private final ConceptDedupScanService scanService;
    private final JobQueueService jobQueueService;
    private final ObjectMapper objectMapper;

    public ConceptDedupController(
            ConceptDedupScanService scanService,
            JobQueueService jobQueueService,
            ObjectMapper objectMapper) {
        this.scanService = scanService;
        this.jobQueueService = jobQueueService;
        this.objectMapper = objectMapper;
    }

    @GetMapping(value = "/scan", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter scan() {
        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(
                () -> {
                    try {
                        List<ConceptDedupGroup> groups =
                                scanService.scan(progress -> emitProgress(emitter, progress));
                        String resultJson =
                                objectMapper.writeValueAsString(Map.of("groups", groups));
                        emitter.send(SseEmitter.event().name("completed").data(resultJson));
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(Map.of("message", ex.getMessage())));
                        } catch (IOException | IllegalStateException ignored) {
                        }
                        emitter.completeWithError(ex);
                    }
                });
        return emitter;
    }

    @PostMapping("/merge")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse enqueueMerge(@RequestBody ConceptMergeRequest request)
            throws IOException {
        String payloadRef = objectMapper.writeValueAsString(request);
        return jobQueueService.enqueue(JobType.MERGE, JobMode.unattended, payloadRef);
    }

    private void emitProgress(SseEmitter emitter, ScanProgress progress) {
        try {
            String resultJson =
                    objectMapper.writeValueAsString(
                            Map.of("current", progress.current(), "total", progress.total()));
            emitter.send(
                    SseEmitter.event()
                            .name("progress")
                            .data(
                                    Map.of(
                                            "step", progress.step(),
                                            "message", progress.message(),
                                            "result", resultJson)));
        } catch (Exception ex) {
            // Client disconnected — swallow so the scan continues to completion.
            log.debug("SSE send failed (client disconnected): {}", ex.getMessage());
        }
    }
}
