package com.dpswikillm.controllers;

import com.dpswikillm.dto.BrokenLinkDeleteRequest;
import com.dpswikillm.dto.BrokenLinkDeleteResult;
import com.dpswikillm.dto.BrokenLinkScanProgress;
import com.dpswikillm.dto.BrokenLinkScanResult;
import com.dpswikillm.dto.HealthCheckProgress;
import com.dpswikillm.dto.KeywordGenerationProgress;
import com.dpswikillm.dto.ReindexProgress;
import com.dpswikillm.dto.ResourceSettingsDto;
import com.dpswikillm.services.BrokenLinkScanService;
import com.dpswikillm.services.HealthCheckService;
import com.dpswikillm.services.KeywordGenerationService;
import com.dpswikillm.services.ReindexService;
import com.dpswikillm.services.ResourceSettingsService;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/settings")
public class SettingsController {

    private final ReindexService reindexService;
    private final ResourceSettingsService resourceSettingsService;
    private final KeywordGenerationService keywordGenerationService;
    private final HealthCheckService healthCheckService;
    private final BrokenLinkScanService brokenLinkScanService;

    public SettingsController(
            ReindexService reindexService,
            ResourceSettingsService resourceSettingsService,
            KeywordGenerationService keywordGenerationService,
            HealthCheckService healthCheckService,
            BrokenLinkScanService brokenLinkScanService) {
        this.reindexService = reindexService;
        this.resourceSettingsService = resourceSettingsService;
        this.keywordGenerationService = keywordGenerationService;
        this.healthCheckService = healthCheckService;
        this.brokenLinkScanService = brokenLinkScanService;
    }

    @GetMapping("/resources")
    public ResourceSettingsDto getResourceSettings() {
        return resourceSettingsService.getSettings();
    }

    @PutMapping("/resources")
    public ResponseEntity<ResourceSettingsDto> updateResourceSettings(
            @RequestBody ResourceSettingsDto request) {
        try {
            return ResponseEntity.ok(
                    resourceSettingsService.updateSettings(request.resourceFolder()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping(value = "/reindex", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter reindex() {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicReference<ReindexProgress> lastProgress =
                new AtomicReference<>(new ReindexProgress(0, 0));
        CompletableFuture.runAsync(
                () -> {
                    try {
                        reindexService.reindexWiki(
                                progress -> {
                                    lastProgress.set(progress);
                                    try {
                                        emitter.send(
                                                SseEmitter.event().name("progress").data(progress));
                                    } catch (IOException | IllegalStateException ex) {
                                        throw new IllegalStateException("SSE send failed", ex);
                                    }
                                });
                        ReindexProgress final_ = lastProgress.get();
                        emitter.send(
                                SseEmitter.event()
                                        .name("done")
                                        .data(new ReindexProgress(final_.total(), final_.total())));
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(new ErrorMessage(ex.getMessage())));
                        } catch (IOException | IllegalStateException ignored) {
                        }
                        emitter.complete();
                    }
                });
        return emitter;
    }

    @GetMapping(value = "/keywords/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generateKeywords() {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicReference<KeywordGenerationProgress> lastProgress =
                new AtomicReference<>(new KeywordGenerationProgress(0, 0, 0, 0));
        CompletableFuture.runAsync(
                () -> {
                    try {
                        keywordGenerationService.generateKeywords(
                                progress -> {
                                    lastProgress.set(progress);
                                    try {
                                        emitter.send(
                                                SseEmitter.event().name("progress").data(progress));
                                    } catch (IOException | IllegalStateException ex) {
                                        throw new IllegalStateException("SSE send failed", ex);
                                    }
                                });
                        emitter.send(SseEmitter.event().name("done").data(lastProgress.get()));
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(new ErrorMessage(ex.getMessage())));
                        } catch (IOException | IllegalStateException ignored) {
                        }
                        emitter.complete();
                    }
                });
        return emitter;
    }

    @GetMapping(value = "/health-check", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter healthCheck() {
        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(
                () -> {
                    try {
                        HealthCheckProgress result =
                                healthCheckService.run(
                                        progress -> {
                                            try {
                                                emitter.send(
                                                        SseEmitter.event()
                                                                .name("progress")
                                                                .data(progress));
                                            } catch (IOException | IllegalStateException ex) {
                                                throw new IllegalStateException(
                                                        "SSE send failed", ex);
                                            }
                                        });
                        emitter.send(SseEmitter.event().name("done").data(result));
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(new ErrorMessage(ex.getMessage())));
                        } catch (IOException | IllegalStateException ignored) {
                        }
                        emitter.complete();
                    }
                });
        return emitter;
    }

    @GetMapping(value = "/broken-links/scan", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter scanBrokenLinks() {
        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(
                () -> {
                    try {
                        AtomicReference<BrokenLinkScanProgress> lastProgress =
                                new AtomicReference<>(new BrokenLinkScanProgress(0, 0, ""));
                        BrokenLinkScanResult result =
                                brokenLinkScanService.scan(
                                        progress -> {
                                            lastProgress.set(progress);
                                            try {
                                                emitter.send(
                                                        SseEmitter.event()
                                                                .name("progress")
                                                                .data(progress));
                                            } catch (IOException | IllegalStateException ex) {
                                                throw new IllegalStateException(
                                                        "SSE send failed", ex);
                                            }
                                        });
                        emitter.send(SseEmitter.event().name("result").data(result));
                        emitter.send(SseEmitter.event().name("done").data("{}"));
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(new ErrorMessage(ex.getMessage())));
                        } catch (IOException | IllegalStateException ignored) {
                        }
                        emitter.complete();
                    }
                });
        return emitter;
    }

    @DeleteMapping("/broken-links")
    public BrokenLinkDeleteResult deleteBrokenLinks(@RequestBody BrokenLinkDeleteRequest request) {
        int deleted =
                brokenLinkScanService.deleteLinks(
                        request.entries() != null ? request.entries() : List.of());
        return new BrokenLinkDeleteResult(deleted);
    }

    private record ErrorMessage(String message) {}
}
