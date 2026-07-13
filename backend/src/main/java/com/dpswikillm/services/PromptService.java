package com.dpswikillm.services;

import com.dpswikillm.domain.LlmPrompt;
import com.dpswikillm.dto.LlmPromptDto;
import com.dpswikillm.repositories.LlmPromptRepository;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PromptService {

    private final LlmPromptRepository repository;
    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();

    public PromptService(LlmPromptRepository repository) {
        this.repository = repository;
    }

    @PostConstruct
    void loadCache() {
        cache.clear();
        repository.findAll().forEach(p -> cache.put(p.getKey(), p.getText()));
    }

    public String getText(String key) {
        String text = cache.get(key);
        if (text == null) {
            throw new IllegalArgumentException("Unknown prompt key: " + key);
        }
        return text;
    }

    @Transactional
    public LlmPromptDto updateText(String key, String newText) {
        LlmPrompt prompt = repository.findByKey(key)
                .orElseThrow(() -> new IllegalArgumentException("Unknown prompt key: " + key));
        prompt.setText(newText);
        LlmPrompt saved = repository.save(prompt);
        cache.put(key, newText);
        return toDto(saved);
    }

    public List<LlmPromptDto> findAll() {
        return repository.findAll().stream().map(this::toDto).toList();
    }

    public LlmPromptDto findByKey(String key) {
        return repository.findByKey(key)
                .map(this::toDto)
                .orElseThrow(() -> new IllegalArgumentException("Unknown prompt key: " + key));
    }

    private LlmPromptDto toDto(LlmPrompt p) {
        return new LlmPromptDto(p.getKey(), p.getName(), p.getText(), p.getUpdatedAt());
    }
}
