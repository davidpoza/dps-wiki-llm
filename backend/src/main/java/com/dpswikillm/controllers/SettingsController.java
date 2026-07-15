package com.dpswikillm.controllers;

import com.dpswikillm.dto.ReindexProgress;
import com.dpswikillm.services.ReindexService;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/settings")
public class SettingsController {

    private final ReindexService reindexService;

    public SettingsController(ReindexService reindexService) {
        this.reindexService = reindexService;
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

    private record ErrorMessage(String message) {}
}
