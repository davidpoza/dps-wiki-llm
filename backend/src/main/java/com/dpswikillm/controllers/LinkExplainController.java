package com.dpswikillm.controllers;

import com.dpswikillm.dto.LinkExplainRequest;
import com.dpswikillm.dto.LinkExplainResponse;
import com.dpswikillm.services.LinkExplainService;
import java.io.IOException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/notes")
public class LinkExplainController {

    private final LinkExplainService linkExplainService;

    public LinkExplainController(LinkExplainService linkExplainService) {
        this.linkExplainService = linkExplainService;
    }

    @PostMapping("/explain-link")
    public ResponseEntity<LinkExplainResponse> explainLink(@RequestBody LinkExplainRequest request)
            throws IOException {
        try {
            String explanation =
                    linkExplainService.explain(request.sourcePath(), request.targetPath());
            return ResponseEntity.ok(new LinkExplainResponse(explanation));
        } catch (LinkExplainService.NoteNotFoundException ex) {
            return ResponseEntity.notFound().build();
        }
    }
}
