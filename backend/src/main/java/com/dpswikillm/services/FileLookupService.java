package com.dpswikillm.services;

import com.dpswikillm.domain.FrontmatterFilter;
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

    public List<SearchResult> lookup(String query, List<FrontmatterFilter> filters, int limit) {
        String text = query == null ? "" : query.trim();
        List<FrontmatterFilter> propertyFilters = filters == null ? List.of() : filters;
        if (text.isBlank() && propertyFilters.isEmpty()) {
            return List.of();
        }
        return repository.lexicalLookup(text, propertyFilters, Math.max(1, limit));
    }
}
