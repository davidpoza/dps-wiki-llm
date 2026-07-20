package com.dpswikillm.services;

import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class SemanticSearchService {
    private final EmbeddingClient embeddingClient;
    private final DocumentIndexRepository repository;

    public SemanticSearchService(EmbeddingClient embeddingClient, DocumentIndexRepository repository) {
        this.embeddingClient = embeddingClient;
        this.repository = repository;
    }

    public List<SearchResult> search(String query, int limit) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return repository.semanticSearch(embeddingClient.embedQuery(query), Math.max(1, limit));
    }

    public List<SearchResult> searchByType(String query, String docType, int limit) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return repository.semanticSearchByType(embeddingClient.embedQuery(query), docType, Math.max(1, limit));
    }
}
