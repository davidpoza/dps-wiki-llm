package com.dpswikillm.controllers;

import com.dpswikillm.dto.KeywordGenerationProgress;
import com.dpswikillm.dto.ReindexProgress;
import com.dpswikillm.dto.ResourceSettingsDto;
import com.dpswikillm.services.KeywordGenerationService;
import com.dpswikillm.services.ReindexService;
import com.dpswikillm.services.ResourceSettingsService;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/settings")
public class SettingsController {

    private final ReindexService reindexService;
    private final ResourceSettingsService resourceSettingsService;
    private final KeywordGenerationService keywordGenerationService;

    public SettingsController(ReindexService reindexService, ResourceSettingsService resourceSettingsService,
                             KeywordGenerationService keywordGenerationService) {
        this.reindexService = reindexService;
        this.resourceSettingsService = resourceSettingsService;
        this.keywordGenerationService = keywordGenerationService;
    }

    @GetMapping("/resources")
    public ResourceSettingsDto getResourceSettings() {
        return resourceSettingsService.getSettings();
    }

    @PutMapping("/resources")
    public ResponseEntity<ResourceSettingsDto> updateResourceSettings(@RequestBody ResourceSettingsDto request) {
        try {
            return ResponseEntity.ok(resourceSettingsService.updateSettings(request.resourceFolder()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping(value = "/reindex", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter reindex() {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicReference<ReindexProgress> lastProgress = new AtomicReference<>(new ReindexProgress(0, 0));
        CompletableFuture.runAsync(() -> {
            try {
                reindexService.reindexWiki(progress -> {
                    lastProgress.set(progress);
                    try {
                        emitter.send(SseEmitter.event().name("progress").data(progress));
                    } catch (IOException | IllegalStateException ex) {
                        throw new IllegalStateException("SSE send failed", ex);
                    }
                });
                ReindexProgress final_ = lastProgress.get();
                emitter.send(SseEmitter.event().name("done").data(new ReindexProgress(final_.total(), final_.total())));
                emitter.complete();
            } catch (Exception ex) {
                try {
                    emitter.send(SseEmitter.event().name("error").data(new ErrorMessage(ex.getMessage())));
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
        CompletableFuture.runAsync(() -> {
            try {
                keywordGenerationService.generateKeywords(progress -> {
                    lastProgress.set(progress);
                    try {
                        emitter.send(SseEmitter.event().name("progress").data(progress));
                    } catch (IOException | IllegalStateException ex) {
                        throw new IllegalStateException("SSE send failed", ex);
                    }
                });
                emitter.send(SseEmitter.event().name("done").data(lastProgress.get()));
                emitter.complete();
            } catch (Exception ex) {
                try {
                    emitter.send(SseEmitter.event().name("error").data(new ErrorMessage(ex.getMessage())));
                } catch (IOException | IllegalStateException ignored) {
                }
                emitter.complete();
            }
        });
        return emitter;
    }

    private record ErrorMessage(String message) {}
}
