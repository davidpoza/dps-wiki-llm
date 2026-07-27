package com.dpswikillm.controllers;

import com.dpswikillm.repositories.DocumentIndexRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/links")
public class LinkScoreController {

    private final DocumentIndexRepository documentIndexRepository;

    public LinkScoreController(DocumentIndexRepository documentIndexRepository) {
        this.documentIndexRepository = documentIndexRepository;
    }

    @GetMapping("/score")
    public ScoreResponse getScore(@RequestParam String src, @RequestParam String tgt) {
        Double score = documentIndexRepository.computeScore(src, tgt).orElse(null);
        return new ScoreResponse(score);
    }

    record ScoreResponse(Double score) {}
}
