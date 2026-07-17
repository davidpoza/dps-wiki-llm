package com.dpswikillm.controllers;

import com.dpswikillm.dto.SnapshotDto;
import com.dpswikillm.services.SnapshotService;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/snapshots")
public class SnapshotController {

    private final SnapshotService snapshotService;

    public SnapshotController(SnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    @GetMapping
    public ResponseEntity<List<SnapshotDto>> getHistory(@RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(snapshotService.getHistory(limit));
    }

    @GetMapping(value = "/{id}/diff", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> getDiff(
            @PathVariable UUID id,
            @RequestParam String path) {
        try {
            return ResponseEntity.ok(snapshotService.getDiff(id, path));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/{id}/reset")
    public ResponseEntity<?> reset(@PathVariable UUID id) {
        try {
            snapshotService.findById(id);
            snapshotService.hardReset(id);
            return ResponseEntity.ok(Map.of("snapshotId", id.toString()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
