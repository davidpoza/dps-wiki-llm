package com.dpswikillm.services;

import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class FileLookupService {
    private final DocumentIndexRepository repository;

    public FileLookupService(DocumentIndexRepository repository) {
        this.repository = repository;
    }

    public List<SearchResult> lookup(String query, int limit) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return repository.lexicalLookup(query.trim(), Math.max(1, limit));
    }
}
