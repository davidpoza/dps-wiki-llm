package com.dpswikillm.repositories;

import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.SearchResult;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface DocumentIndexRepository {
    void replaceDocuments(List<DocumentRecord> documents);

    /** Insert or update the content-index entry for a single document, keyed by path. */
    void upsertDocument(DocumentRecord document);

    /** Remove the content-index entry for a path, if present. */
    void deleteDocument(String path);

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

    Set<String> findEmbeddedPathsByDocType(String model, String docType);

    Optional<Instant> findEmbeddingStatus(String path);

    Optional<Double> computeScore(String srcPath, String tgtPath);

    /**
     * Neighborhood-density statistic r_k for one document: the mean cosine similarity to its {@code
     * k} nearest neighbors in the same model space, excluding itself. Empty when the document has
     * no embedding or has no neighbors.
     */
    Optional<Double> computeHubness(UUID documentId, String model, int k);

    void updateHubness(UUID documentId, String model, double hubness);

    /** Stored hubness r_k keyed by document path, for the given model. */
    Map<String, Double> findHubnessByPath(String model);

    /** Document ids that have an embedding for the model but no computed hubness yet. */
    List<UUID> findDocumentIdsMissingHubness(String model);

    record GlobalSimilarityStats(double mean, double p90, double p95, double p99, int pairCount) {}

    /**
     * Sample the global pairwise cosine-similarity distribution over the index by drawing a random
     * subset of embeddings and comparing all of their pairs. Used to observe the model's
     * anisotropy.
     */
    GlobalSimilarityStats sampleGlobalSimilarityStats(String model, int sampleSize);
}
