package com.dpswikillm.controllers;

import com.dpswikillm.dto.ConflictDto;
import com.dpswikillm.dto.ConflictResolveRequest;
import com.dpswikillm.services.WebDavNotConfiguredException;
import com.dpswikillm.services.WebDavReplicationException;
import com.dpswikillm.services.WebDavSyncService;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/webdav")
public class WebDavController {

    private final WebDavSyncService webDavSyncService;

    public WebDavController(WebDavSyncService webDavSyncService) {
        this.webDavSyncService = webDavSyncService;
    }

    @PostMapping("/sync")
    public ResponseEntity<?> sync() {
        try {
            return ResponseEntity.ok(webDavSyncService.sync());
        } catch (WebDavNotConfiguredException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "not_configured"));
        } catch (WebDavReplicationException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", e.getMessage()));
        }
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
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "not_replicated"));
        }
    }
}
