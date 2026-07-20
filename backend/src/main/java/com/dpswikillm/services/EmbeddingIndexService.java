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
import org.springframework.stereotype.Service;

@Service
public class EmbeddingIndexService {
    private final DocumentIndexRepository repository;
    private final EmbeddingClient embeddingClient;
    private final AppProperties properties;
    private final MarkdownService markdownService;

    public EmbeddingIndexService(DocumentIndexRepository repository, EmbeddingClient embeddingClient,
                                  AppProperties properties, MarkdownService markdownService) {
        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.properties = properties;
        this.markdownService = markdownService;
    }

    public EmbedIndexResult embedIncremental() {
        List<DocumentRecord> documents = repository.findAllDocuments();
        Map<UUID, String> existingHashes = repository.findEmbeddingHashes(properties.embeddings().model());
        List<DocumentRecord> changed = documents.stream()
                .filter(doc -> !normalizedHash(doc).equals(existingHashes.get(doc.id())))
                .toList();

        if (!changed.isEmpty()) {
            List<float[]> vectors = embeddingClient.embedPassages(changed.stream().map(this::normalizedText).toList());
            for (int i = 0; i < changed.size(); i += 1) {
                DocumentRecord doc = changed.get(i);
                repository.upsertEmbedding(doc.id(), properties.embeddings().model(), properties.embeddings().dimension(),
                        vectors.get(i), normalizedHash(doc));
            }
        }
        repository.pruneEmbeddingsNotIn(properties.embeddings().model(), documents.stream().map(DocumentRecord::id).toList());
        return new EmbedIndexResult(documents.size(), changed.size());
    }

    private String normalizedHash(DocumentRecord doc) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(normalizedText(doc).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private String normalizedText(DocumentRecord doc) {
        var frontmatter = markdownService.parse(doc.body()).frontmatter();
        Object raw = frontmatter.get("keywords");
        if (raw instanceof List<?> kw && !kw.isEmpty()) {
            String joined = kw.stream().map(Object::toString).collect(java.util.stream.Collectors.joining(" "));
            return (doc.title() + " " + joined).replaceAll("\\s+", " ").trim();
        }
        return (doc.title() + "\n" + doc.body()).replaceAll("\\s+", " ").trim();
    }

    public record EmbedIndexResult(int totalDocuments, int embeddedDocuments) {}
}
