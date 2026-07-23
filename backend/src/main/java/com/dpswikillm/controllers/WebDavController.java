package com.dpswikillm.controllers;

import com.dpswikillm.dto.ConflictDto;
import com.dpswikillm.dto.ConflictResolveRequest;
import com.dpswikillm.services.WebDavNotConfiguredException;
import com.dpswikillm.services.WebDavReplicationException;
import com.dpswikillm.services.WebDavSyncService;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.CompletableFuture;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/webdav")
public class WebDavController {

    private final WebDavSyncService webDavSyncService;

    public WebDavController(WebDavSyncService webDavSyncService) {
        this.webDavSyncService = webDavSyncService;
    }

    @GetMapping(value = "/sync", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter sync() {
        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(
                () -> {
                    try {
                        var result =
                                webDavSyncService.sync(
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
                    } catch (WebDavNotConfiguredException e) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(Map.of("code", "not_configured")));
                        } catch (IOException | IllegalStateException ignored) {
                        }
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(Map.of("message", ex.getMessage())));
                        } catch (IOException | IllegalStateException ignored) {
                        }
                        emitter.complete();
                    }
                });
        return emitter;
    }

    @GetMapping("/conflicts")
    public ResponseEntity<List<ConflictDto>> conflicts() {
        return ResponseEntity.ok(webDavSyncService.listConflicts());
    }

    @PostMapping("/conflicts/resolve")
    public ResponseEntity<?> resolve(@RequestBody ConflictResolveRequest request) {
        try {
            webDavSyncService.resolveConflict(request.path(), request.keep());
            return ResponseEntity.ok().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (WebDavReplicationException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "not_replicated"));
        }
    }
}
