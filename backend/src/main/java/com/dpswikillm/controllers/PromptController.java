package com.dpswikillm.controllers;

import com.dpswikillm.dto.LlmPromptDto;
import com.dpswikillm.dto.LlmPromptUpdateRequest;
import com.dpswikillm.services.PromptService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/settings/prompts")
public class PromptController {

    private final PromptService promptService;

    public PromptController(PromptService promptService) {
        this.promptService = promptService;
    }

    @GetMapping
    public List<LlmPromptDto> listPrompts() {
        return promptService.findAll();
    }

    @GetMapping("/{key}")
    public ResponseEntity<LlmPromptDto> getPrompt(@PathVariable String key) {
        try {
            return ResponseEntity.ok(promptService.findByKey(key));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{key}")
    public ResponseEntity<LlmPromptDto> updatePrompt(
            @PathVariable String key, @RequestBody LlmPromptUpdateRequest request) {
        try {
            return ResponseEntity.ok(promptService.updateText(key, request.text()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }
}
