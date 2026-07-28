package com.dpswikillm.controllers;

import com.dpswikillm.services.LinkDiagnosticsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/links")
public class LinkScoreController {

    private final LinkDiagnosticsService linkDiagnosticsService;

    public LinkScoreController(LinkDiagnosticsService linkDiagnosticsService) {
        this.linkDiagnosticsService = linkDiagnosticsService;
    }

    /**
     * Raw cosine plus the CSLS-adjusted score and whether it clears the current acceptance margin,
     * for the editor's link context menu.
     */
    @GetMapping("/score")
    public LinkDiagnosticsService.LinkScore getScore(
            @RequestParam String src, @RequestParam String tgt) {
        return linkDiagnosticsService.scoreLink(src, tgt);
    }

    /**
     * Read-only calibration/verification: the global pairwise cosine distribution plus the labeled
     * benchmark scored with both raw cosine and CSLS against the current acceptance margin.
     */
    @GetMapping("/diagnostics")
    public LinkDiagnosticsService.Diagnostics getDiagnostics() {
        return linkDiagnosticsService.run();
    }
}
