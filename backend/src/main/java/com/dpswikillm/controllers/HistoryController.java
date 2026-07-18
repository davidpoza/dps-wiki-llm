package com.dpswikillm.controllers;

import com.dpswikillm.dto.FileHistoryEntryDto;
import com.dpswikillm.services.SnapshotService;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Per-file change history. Replaces the previous commit-grouped snapshot view:
 * history is now a flat, reverse-chronological stream of individual file changes.
 */
@RestController
@RequestMapping("/history")
public class HistoryController {

    private final SnapshotService snapshotService;

    public HistoryController(SnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    @GetMapping
    public ResponseEntity<List<FileHistoryEntryDto>> getHistory(@RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(snapshotService.getFileHistory(limit));
    }

    @GetMapping(value = "/{changeId}/diff", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> getDiff(@PathVariable UUID changeId) {
        try {
            return ResponseEntity.ok(snapshotService.getDiffByChangeId(changeId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
