package com.dpswikillm.repositories;

import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.SearchResult;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface DocumentIndexRepository {
    void replaceDocuments(List<DocumentRecord> documents);

    List<DocumentRecord> findAllDocuments();

    Map<UUID, String> findEmbeddingHashes(String model);

    void upsertEmbedding(
            UUID documentId,
            String model,
            int dimension,
            float[] embedding,
            String normalizedTextHash);

    void pruneEmbeddingsNotIn(String model, List<UUID> documentIds);

    List<SearchResult> semanticSearch(float[] queryVector, int limit);

    List<SearchResult> semanticSearchByType(float[] queryVector, String docType, int limit);

    List<SearchResult> lexicalLookup(String query, int limit);

    record SimilarPair(String path1, String path2, double similarity) {}

    List<SimilarPair> findSimilarPairsByDocType(String model, String docType, double threshold);

    List<DocumentRecord> findDocumentsByDocType(String docType);
}
