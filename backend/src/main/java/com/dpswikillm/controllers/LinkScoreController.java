package com.dpswikillm.controllers;

import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.services.LinkDiagnosticsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/links")
public class LinkScoreController {

    private final DocumentIndexRepository documentIndexRepository;
    private final LinkDiagnosticsService linkDiagnosticsService;

    public LinkScoreController(
            DocumentIndexRepository documentIndexRepository,
            LinkDiagnosticsService linkDiagnosticsService) {
        this.documentIndexRepository = documentIndexRepository;
        this.linkDiagnosticsService = linkDiagnosticsService;
    }

    @GetMapping("/score")
    public ScoreResponse getScore(@RequestParam String src, @RequestParam String tgt) {
        Double score = documentIndexRepository.computeScore(src, tgt).orElse(null);
        return new ScoreResponse(score);
    }

    /**
     * Read-only calibration/verification: the global pairwise cosine distribution plus the labeled
     * benchmark scored with both raw cosine and CSLS against the current acceptance margin.
     */
    @GetMapping("/diagnostics")
    public LinkDiagnosticsService.Diagnostics getDiagnostics() {
        return linkDiagnosticsService.run();
    }

    record ScoreResponse(Double score) {}
}
