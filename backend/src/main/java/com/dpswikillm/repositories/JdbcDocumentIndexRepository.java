package com.dpswikillm.repositories;

import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.SearchResult;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcDocumentIndexRepository implements DocumentIndexRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcDocumentIndexRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void replaceDocuments(List<DocumentRecord> documents) {
        jdbcTemplate.update("DELETE FROM documents WHERE path NOT LIKE 'wiki/%'");
        for (DocumentRecord doc : documents) {
            jdbcTemplate.update(
                    """
                    INSERT INTO documents (id, path, title, doc_type, updated_at, body)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT (path) DO UPDATE SET
                      title = EXCLUDED.title,
                      doc_type = EXCLUDED.doc_type,
                      updated_at = EXCLUDED.updated_at,
                      body = EXCLUDED.body
                    """,
                    doc.id(),
                    doc.path(),
                    doc.title(),
                    doc.docType(),
                    Timestamp.from(doc.updatedAt()),
                    doc.body());
        }
        List<String> paths = documents.stream().map(DocumentRecord::path).toList();
        if (paths.isEmpty()) {
            jdbcTemplate.update("DELETE FROM documents");
        } else {
            String placeholders =
                    paths.stream().map(ignored -> "?").collect(Collectors.joining(","));
            jdbcTemplate.update(
                    "DELETE FROM documents WHERE path NOT IN (" + placeholders + ")",
                    paths.toArray());
        }
    }

    @Override
    public List<DocumentRecord> findAllDocuments() {
        return jdbcTemplate.query(
                """
                SELECT id, path, title, doc_type, updated_at, body
                FROM documents
                ORDER BY path
                """,
                (rs, rowNum) ->
                        new DocumentRecord(
                                rs.getObject("id", UUID.class),
                                rs.getString("path"),
                                rs.getString("title"),
                                rs.getString("doc_type"),
                                rs.getTimestamp("updated_at").toInstant(),
                                rs.getString("body")));
    }

    @Override
    public Map<UUID, String> findEmbeddingHashes(String model) {
        return jdbcTemplate.query(
                """
                SELECT document_id, normalized_text_hash
                FROM document_embeddings
                WHERE model = ?
                """,
                rs -> {
                    java.util.LinkedHashMap<UUID, String> rows = new java.util.LinkedHashMap<>();
                    while (rs.next()) {
                        rows.put(
                                rs.getObject("document_id", UUID.class),
                                rs.getString("normalized_text_hash"));
                    }
                    return rows;
                },
                model);
    }

    @Override
    public void upsertEmbedding(
            UUID documentId,
            String model,
            int dimension,
            float[] embedding,
            String normalizedTextHash) {
        jdbcTemplate.update(
                """
                INSERT INTO document_embeddings (document_id, model, dimension, embedding, normalized_text_hash)
                VALUES (?, ?, ?, ?::vector, ?)
                ON CONFLICT (document_id, model) DO UPDATE SET
                  dimension = EXCLUDED.dimension,
                  embedding = EXCLUDED.embedding,
                  normalized_text_hash = EXCLUDED.normalized_text_hash,
                  embedded_at = now()
                """,
                documentId,
                model,
                dimension,
                vectorLiteral(embedding),
                normalizedTextHash);
    }

    @Override
    public void pruneEmbeddingsNotIn(String model, List<UUID> documentIds) {
        if (documentIds.isEmpty()) {
            jdbcTemplate.update("DELETE FROM document_embeddings WHERE model = ?", model);
            return;
        }
        String placeholders =
                documentIds.stream().map(ignored -> "?").collect(Collectors.joining(","));
        Object[] args = new Object[documentIds.size() + 1];
        args[0] = model;
        for (int i = 0; i < documentIds.size(); i += 1) {
            args[i + 1] = documentIds.get(i);
        }
        jdbcTemplate.update(
                "DELETE FROM document_embeddings WHERE model = ? AND document_id NOT IN ("
                        + placeholders
                        + ")",
                args);
    }

    @Override
    public List<SearchResult> semanticSearch(float[] queryVector, int limit) {
        return jdbcTemplate.query(
                """
                SELECT d.path, d.title, d.doc_type, d.body, 1 - (e.embedding <=> ?::vector) AS score
                FROM document_embeddings e
                JOIN documents d ON d.id = e.document_id
                ORDER BY e.embedding <=> ?::vector
                LIMIT ?
                """,
                (rs, rowNum) ->
                        new SearchResult(
                                rs.getString("path"),
                                rs.getString("title"),
                                rs.getString("doc_type"),
                                rs.getDouble("score"),
                                rs.getString("body")),
                vectorLiteral(queryVector),
                vectorLiteral(queryVector),
                limit);
    }

    @Override
    public List<SearchResult> semanticSearchByType(float[] queryVector, String docType, int limit) {
        return jdbcTemplate.query(
                """
                SELECT d.path, d.title, d.doc_type, d.body, 1 - (e.embedding <=> ?::vector) AS score
                FROM document_embeddings e
                JOIN documents d ON d.id = e.document_id
                WHERE d.doc_type = ?
                ORDER BY e.embedding <=> ?::vector
                LIMIT ?
                """,
                (rs, rowNum) ->
                        new SearchResult(
                                rs.getString("path"),
                                rs.getString("title"),
                                rs.getString("doc_type"),
                                rs.getDouble("score"),
                                rs.getString("body")),
                vectorLiteral(queryVector),
                docType,
                vectorLiteral(queryVector),
                limit);
    }

    @Override
    public List<SearchResult> lexicalLookup(String query, int limit) {
        String pattern = "%" + query + "%";
        return jdbcTemplate.query(
                """
                SELECT path, title, doc_type, body,
                       GREATEST(similarity(title, ?), similarity(path, ?), similarity(body, ?)) AS score
                FROM documents
                WHERE title ILIKE ? OR path ILIKE ? OR body ILIKE ?
                ORDER BY score DESC, path
                LIMIT ?
                """,
                (rs, rowNum) ->
                        new SearchResult(
                                rs.getString("path"),
                                rs.getString("title"),
                                rs.getString("doc_type"),
                                rs.getDouble("score"),
                                rs.getString("body")),
                query,
                query,
                query,
                pattern,
                pattern,
                pattern,
                limit);
    }

    @Override
    public List<SimilarPair> findSimilarPairsByDocType(
            String model, String docType, double threshold) {
        return jdbcTemplate.query(
                """
                SELECT d1.path AS path1, d2.path AS path2,
                       1 - (e1.embedding <=> e2.embedding) AS similarity
                FROM document_embeddings e1
                JOIN documents d1 ON d1.id = e1.document_id
                JOIN document_embeddings e2 ON e2.model = e1.model
                JOIN documents d2 ON d2.id = e2.document_id
                WHERE e1.model = ?
                  AND d1.doc_type = ?
                  AND d2.doc_type = ?
                  AND d1.id < d2.id
                  AND 1 - (e1.embedding <=> e2.embedding) >= ?
                ORDER BY similarity DESC
                """,
                (rs, rowNum) ->
                        new SimilarPair(
                                rs.getString("path1"),
                                rs.getString("path2"),
                                rs.getDouble("similarity")),
                model,
                docType,
                docType,
                threshold);
    }

    @Override
    public Set<String> findEmbeddedPathsByDocType(String model, String docType) {
        List<String> paths =
                jdbcTemplate.queryForList(
                        """
                        SELECT d.path
                        FROM documents d
                        JOIN document_embeddings de ON de.document_id = d.id
                        WHERE d.doc_type = ? AND de.model = ?
                        """,
                        String.class,
                        docType,
                        model);
        return new LinkedHashSet<>(paths);
    }

    @Override
    public List<DocumentRecord> findDocumentsByDocType(String docType) {
        return jdbcTemplate.query(
                """
                SELECT id, path, title, doc_type, updated_at, body
                FROM documents
                WHERE doc_type = ?
                ORDER BY path
                """,
                (rs, rowNum) ->
                        new DocumentRecord(
                                rs.getObject("id", UUID.class),
                                rs.getString("path"),
                                rs.getString("title"),
                                rs.getString("doc_type"),
                                rs.getTimestamp("updated_at").toInstant(),
                                rs.getString("body")),
                docType);
    }

    @Override
    public Optional<Instant> findEmbeddingStatus(String path) {
        List<Instant> result =
                jdbcTemplate.query(
                        """
                SELECT de.embedded_at
                FROM documents d
                JOIN document_embeddings de ON de.document_id = d.id
                WHERE d.path = ?
                LIMIT 1
                """,
                        (rs, rowNum) -> {
                            Timestamp ts = rs.getTimestamp("embedded_at");
                            return ts != null ? ts.toInstant() : null;
                        },
                        path);
        return result.isEmpty() ? Optional.empty() : Optional.ofNullable(result.get(0));
    }

    @Override
    public Optional<Double> computeScore(String srcPath, String tgtPath) {
        List<Double> result =
                jdbcTemplate.query(
                        """
                        SELECT 1 - (e1.embedding <=> e2.embedding) AS score
                        FROM document_embeddings e1
                        JOIN documents d1 ON d1.id = e1.document_id
                        JOIN document_embeddings e2 ON e2.model = e1.model
                        JOIN documents d2 ON d2.id = e2.document_id
                        WHERE d1.path = ? AND d2.path = ?
                        LIMIT 1
                        """,
                        (rs, rowNum) -> rs.getDouble("score"),
                        srcPath,
                        tgtPath);
        return result.isEmpty() ? Optional.empty() : Optional.of(result.get(0));
    }

    @Override
    public Optional<Double> computeHubness(UUID documentId, String model, int k) {
        List<Double> result =
                jdbcTemplate.query(
                        """
                        SELECT avg(sim) AS hubness FROM (
                            SELECT 1 - (e_other.embedding <=> e_self.embedding) AS sim
                            FROM document_embeddings e_self
                            JOIN document_embeddings e_other
                              ON e_other.model = e_self.model
                             AND e_other.document_id <> e_self.document_id
                            WHERE e_self.document_id = ? AND e_self.model = ?
                            ORDER BY e_self.embedding <=> e_other.embedding
                            LIMIT ?
                        ) neighbors
                        """,
                        (rs, rowNum) -> {
                            double value = rs.getDouble("hubness");
                            return rs.wasNull() ? null : value;
                        },
                        documentId,
                        model,
                        k);
        return result.isEmpty() ? Optional.empty() : Optional.ofNullable(result.get(0));
    }

    @Override
    public void updateHubness(UUID documentId, String model, double hubness) {
        jdbcTemplate.update(
                "UPDATE document_embeddings SET hubness = ? WHERE document_id = ? AND model = ?",
                hubness,
                documentId,
                model);
    }

    @Override
    public Map<String, Double> findHubnessByPath(String model) {
        return jdbcTemplate.query(
                """
                SELECT d.path, e.hubness
                FROM document_embeddings e
                JOIN documents d ON d.id = e.document_id
                WHERE e.model = ? AND e.hubness IS NOT NULL
                """,
                rs -> {
                    Map<String, Double> byPath = new java.util.LinkedHashMap<>();
                    while (rs.next()) {
                        byPath.put(rs.getString("path"), rs.getDouble("hubness"));
                    }
                    return byPath;
                },
                model);
    }

    @Override
    public List<UUID> findDocumentIdsMissingHubness(String model) {
        return jdbcTemplate.query(
                "SELECT document_id FROM document_embeddings WHERE model = ? AND hubness IS NULL",
                (rs, rowNum) -> rs.getObject("document_id", UUID.class),
                model);
    }

    @Override
    public GlobalSimilarityStats sampleGlobalSimilarityStats(String model, int sampleSize) {
        GlobalSimilarityStats stats =
                jdbcTemplate.query(
                        """
                        WITH sample AS (
                            SELECT embedding FROM document_embeddings
                            WHERE model = ?
                            ORDER BY random()
                            LIMIT ?
                        ),
                        numbered AS (
                            SELECT embedding, row_number() OVER () AS rn FROM sample
                        ),
                        pairs AS (
                            SELECT 1 - (a.embedding <=> b.embedding) AS sim
                            FROM numbered a JOIN numbered b ON a.rn < b.rn
                        )
                        SELECT
                            count(*) AS pair_count,
                            coalesce(avg(sim), 0) AS mean,
                            coalesce(percentile_cont(0.90) WITHIN GROUP (ORDER BY sim), 0) AS p90,
                            coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY sim), 0) AS p95,
                            coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY sim), 0) AS p99
                        FROM pairs
                        """,
                        rs -> {
                            if (!rs.next()) {
                                return new GlobalSimilarityStats(0, 0, 0, 0, 0);
                            }
                            return new GlobalSimilarityStats(
                                    rs.getDouble("mean"),
                                    rs.getDouble("p90"),
                                    rs.getDouble("p95"),
                                    rs.getDouble("p99"),
                                    rs.getInt("pair_count"));
                        },
                        model,
                        sampleSize);
        return stats != null ? stats : new GlobalSimilarityStats(0, 0, 0, 0, 0);
    }

    private String vectorLiteral(float[] vector) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < vector.length; i += 1) {
            if (i > 0) {
                out.append(',');
            }
            out.append(vector[i]);
        }
        return out.append(']').toString();
    }
}
