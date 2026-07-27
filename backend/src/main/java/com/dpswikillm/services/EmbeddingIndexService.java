package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import org.springframework.stereotype.Service;

@Service
public class EmbeddingIndexService {
    private final DocumentIndexRepository repository;
    private final EmbeddingClient embeddingClient;
    private final AppProperties properties;
    private final MarkdownService markdownService;

    public EmbeddingIndexService(
            DocumentIndexRepository repository,
            EmbeddingClient embeddingClient,
            AppProperties properties,
            MarkdownService markdownService) {
        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.properties = properties;
        this.markdownService = markdownService;
    }

    public EmbedIndexResult embedIncremental() {
        return embedIncremental(progress -> {});
    }

    /**
     * Re-embed changed documents, reporting progress after each batch so callers can surface a live
     * percentage. Documents are embedded in {@code maxBatchSize} chunks (matching the backend's
     * request limit).
     */
    public EmbedIndexResult embedIncremental(Consumer<EmbedProgress> onProgress) {
        List<DocumentRecord> documents = repository.findAllDocuments();
        Map<UUID, String> existingHashes =
                repository.findEmbeddingHashes(properties.embeddings().model());
        List<DocumentRecord> changed =
                documents.stream()
                        .filter(doc -> !normalizedHash(doc).equals(existingHashes.get(doc.id())))
                        .toList();

        int total = changed.size();
        if (total > 0) {
            int batchSize = Math.max(1, properties.embeddings().maxBatchSize());
            onProgress.accept(new EmbedProgress(0, total));
            for (int start = 0; start < total; start += batchSize) {
                List<DocumentRecord> chunk =
                        changed.subList(start, Math.min(start + batchSize, total));
                List<float[]> vectors =
                        embeddingClient.embedPassages(
                                chunk.stream().map(this::normalizedText).toList());
                for (int i = 0; i < chunk.size(); i += 1) {
                    DocumentRecord doc = chunk.get(i);
                    repository.upsertEmbedding(
                            doc.id(),
                            properties.embeddings().model(),
                            properties.embeddings().dimension(),
                            vectors.get(i),
                            normalizedHash(doc));
                }
                onProgress.accept(new EmbedProgress(Math.min(start + batchSize, total), total));
            }
        }
        repository.pruneEmbeddingsNotIn(
                properties.embeddings().model(),
                documents.stream().map(DocumentRecord::id).toList());
        return new EmbedIndexResult(documents.size(), changed.size());
    }

    private String normalizedHash(DocumentRecord doc) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of()
                    .formatHex(digest.digest(normalizedText(doc).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private String normalizedText(DocumentRecord doc) {
        var frontmatter = markdownService.parse(doc.body()).frontmatter();
        Object raw = frontmatter.get("keywords");
        if (raw instanceof List<?> kw && !kw.isEmpty()) {
            String joined =
                    kw.stream()
                            .map(k -> k.toString().replace('-', ' '))
                            .collect(java.util.stream.Collectors.joining(", "));
            return "Primary topic: " + doc.title().replace('-', ' ') + ". Related concepts: " + joined + ".";
        }
        return (doc.title() + "\n" + doc.body()).replaceAll("\\s+", " ").trim();
    }

    public record EmbedIndexResult(int totalDocuments, int embeddedDocuments) {}

    public record EmbedProgress(int processed, int total) {}
}
