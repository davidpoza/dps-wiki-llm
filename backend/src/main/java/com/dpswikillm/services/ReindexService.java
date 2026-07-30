package com.dpswikillm.services;

import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.dto.ReindexProgress;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class ReindexService {
    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final DocumentIndexRepository repository;

    public ReindexService(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            DocumentIndexRepository repository) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.repository = repository;
    }

    public List<DocumentRecord> reindexWiki() throws IOException {
        return reindexWiki(progress -> {});
    }

    public List<DocumentRecord> reindexWiki(Consumer<ReindexProgress> onProgress)
            throws IOException {
        Path wikiRoot = pathResolver.resolve("wiki");
        if (!Files.exists(wikiRoot)) {
            repository.replaceDocuments(List.of());
            onProgress.accept(new ReindexProgress(0, 0));
            return List.of();
        }
        List<Path> filePaths;
        try (Stream<Path> paths = Files.walk(wikiRoot)) {
            filePaths =
                    paths.filter(Files::isRegularFile)
                            .filter(path -> path.getFileName().toString().endsWith(".md"))
                            .toList();
        }
        int total = filePaths.size();
        List<DocumentRecord> documents = new ArrayList<>(total);
        for (int i = 0; i < filePaths.size(); i++) {
            documents.add(
                    WikiDocumentReader.read(
                            pathResolver.vaultRoot(), markdownService, filePaths.get(i)));
            onProgress.accept(new ReindexProgress(i + 1, total));
        }
        repository.replaceDocuments(documents);
        return documents;
    }
}
