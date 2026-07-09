package com.dpswikillm.repositories;

import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.SearchResult;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@ConditionalOnBean(JdbcTemplate.class)
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
            jdbcTemplate.update("""
                    INSERT INTO documents (id, path, title, doc_type, updated_at, body)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT (path) DO UPDATE SET
                      title = EXCLUDED.title,
                      doc_type = EXCLUDED.doc_type,
                      updated_at = EXCLUDED.updated_at,
                      body = EXCLUDED.body
                    """,
                    doc.id(), doc.path(), doc.title(), doc.docType(), Timestamp.from(doc.updatedAt()), doc.body());
        }
        List<String> paths = documents.stream().map(DocumentRecord::path).toList();
        if (paths.isEmpty()) {
            jdbcTemplate.update("DELETE FROM documents");
        } else {
            String placeholders = paths.stream().map(ignored -> "?").collect(Collectors.joining(","));
            jdbcTemplate.update("DELETE FROM documents WHERE path NOT IN (" + placeholders + ")", paths.toArray());
        }
    }

    @Override
    public List<DocumentRecord> findAllDocuments() {
        return jdbcTemplate.query("""
                SELECT id, path, title, doc_type, updated_at, body
                FROM documents
                ORDER BY path
                """, (rs, rowNum) -> new DocumentRecord(
                rs.getObject("id", UUID.class),
                rs.getString("path"),
                rs.getString("title"),
                rs.getString("doc_type"),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getString("body")));
    }

    @Override
    public Map<UUID, String> findEmbeddingHashes(String model) {
        return jdbcTemplate.query("""
                SELECT document_id, normalized_text_hash
                FROM document_embeddings
                WHERE model = ?
                """, rs -> {
            java.util.LinkedHashMap<UUID, String> rows = new java.util.LinkedHashMap<>();
            while (rs.next()) {
                rows.put(rs.getObject("document_id", UUID.class), rs.getString("normalized_text_hash"));
            }
            return rows;
        }, model);
    }

    @Override
    public void upsertEmbedding(UUID documentId, String model, int dimension, float[] embedding, String normalizedTextHash) {
        jdbcTemplate.update("""
                INSERT INTO document_embeddings (document_id, model, dimension, embedding, normalized_text_hash)
                VALUES (?, ?, ?, ?::vector, ?)
                ON CONFLICT (document_id, model) DO UPDATE SET
                  dimension = EXCLUDED.dimension,
                  embedding = EXCLUDED.embedding,
                  normalized_text_hash = EXCLUDED.normalized_text_hash,
                  embedded_at = now()
                """, documentId, model, dimension, vectorLiteral(embedding), normalizedTextHash);
    }

    @Override
    public void pruneEmbeddingsNotIn(String model, List<UUID> documentIds) {
        if (documentIds.isEmpty()) {
            jdbcTemplate.update("DELETE FROM document_embeddings WHERE model = ?", model);
            return;
        }
        String placeholders = documentIds.stream().map(ignored -> "?").collect(Collectors.joining(","));
        Object[] args = new Object[documentIds.size() + 1];
        args[0] = model;
        for (int i = 0; i < documentIds.size(); i += 1) {
            args[i + 1] = documentIds.get(i);
        }
        jdbcTemplate.update("DELETE FROM document_embeddings WHERE model = ? AND document_id NOT IN (" + placeholders + ")", args);
    }

    @Override
    public List<SearchResult> semanticSearch(float[] queryVector, int limit) {
        return jdbcTemplate.query("""
                SELECT d.path, d.title, d.doc_type, d.body, 1 - (e.embedding <=> ?::vector) AS score
                FROM document_embeddings e
                JOIN documents d ON d.id = e.document_id
                ORDER BY e.embedding <=> ?::vector
                LIMIT ?
                """, (rs, rowNum) -> new SearchResult(
                rs.getString("path"),
                rs.getString("title"),
                rs.getString("doc_type"),
                rs.getDouble("score"),
                rs.getString("body")), vectorLiteral(queryVector), vectorLiteral(queryVector), limit);
    }

    @Override
    public List<SearchResult> lexicalLookup(String query, int limit) {
        String pattern = "%" + query + "%";
        return jdbcTemplate.query("""
                SELECT path, title, doc_type, body,
                       GREATEST(similarity(title, ?), similarity(path, ?), similarity(body, ?)) AS score
                FROM documents
                WHERE title ILIKE ? OR path ILIKE ? OR body ILIKE ?
                ORDER BY score DESC, path
                LIMIT ?
                """, (rs, rowNum) -> new SearchResult(
                rs.getString("path"),
                rs.getString("title"),
                rs.getString("doc_type"),
                rs.getDouble("score"),
                rs.getString("body")), query, query, query, pattern, pattern, pattern, limit);
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
