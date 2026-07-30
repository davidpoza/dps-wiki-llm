package com.dpswikillm.services;

import com.dpswikillm.repositories.DocumentIndexRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Service;

/**
 * Keeps the lexical content index ({@code documents}) in sync for individual wiki notes, without a
 * full reindex. Record derivation is shared with the bulk reindex via {@link WikiDocumentReader}.
 */
@Service
public class DocumentIndexService {
    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final DocumentIndexRepository repository;

    public DocumentIndexService(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            DocumentIndexRepository repository) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.repository = repository;
    }

    /**
     * Upserts the content-index entry for a single wiki note. No-op for non-wiki, non-markdown, or
     * missing paths.
     */
    public void indexFile(String relativePath) {
        String normalized = pathResolver.normalizeRelativePath(relativePath);
        if (!isIndexableNote(normalized)) {
            return;
        }
        Path resolved = pathResolver.resolve(normalized);
        if (!Files.isRegularFile(resolved)) {
            return;
        }
        repository.upsertDocument(
                WikiDocumentReader.read(pathResolver.vaultRoot(), markdownService, resolved));
    }

    /** Removes the content-index entry for a note path, if present. */
    public void removeFromIndex(String relativePath) {
        repository.deleteDocument(pathResolver.normalizeRelativePath(relativePath));
    }

    private boolean isIndexableNote(String normalizedPath) {
        return normalizedPath.startsWith("wiki/") && normalizedPath.endsWith(".md");
    }
}
