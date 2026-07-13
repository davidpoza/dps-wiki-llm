package com.dpswikillm.controllers;

import com.dpswikillm.dto.CommitDto;
import com.dpswikillm.services.GitService;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/git")
public class GitController {

    private final GitService gitService;

    public GitController(GitService gitService) {
        this.gitService = gitService;
    }

    @GetMapping("/log")
    public ResponseEntity<List<CommitDto>> getLog(@RequestParam(defaultValue = "50") int limit) {
        try {
            return ResponseEntity.ok(gitService.getLog(limit));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/reset")
    public ResponseEntity<?> reset(@RequestBody Map<String, String> body) {
        String sha = body.get("sha");
        if (sha == null || sha.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "sha is required"));
        }
        try {
            gitService.resetHard(sha);
            String head = gitService.getHead().orElse(sha);
            return ResponseEntity.ok(Map.of("sha", head));
        } catch (IllegalArgumentException | IllegalStateException e) {
            // git failures (bad SHA, unknown revision) are client errors
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
