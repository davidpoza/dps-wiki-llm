package com.dpswikillm.controllers;

import com.dpswikillm.dto.EmbeddingStatusResponse;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.time.Instant;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/documents")
public class DocumentController {

    private final DocumentIndexRepository documentIndexRepository;

    public DocumentController(DocumentIndexRepository documentIndexRepository) {
        this.documentIndexRepository = documentIndexRepository;
    }

    @GetMapping("/embedding-status")
    public ResponseEntity<EmbeddingStatusResponse> getEmbeddingStatus(@RequestParam String path) {
        if (path.contains("..")) {
            return ResponseEntity.badRequest().build();
        }
        Optional<Instant> embeddedAt = documentIndexRepository.findEmbeddingStatus(path);
        EmbeddingStatusResponse response =
                embeddedAt
                        .map(instant -> new EmbeddingStatusResponse(true, instant))
                        .orElse(new EmbeddingStatusResponse(false, null));
        return ResponseEntity.ok(response);
    }
}
