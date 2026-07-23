package com.dpswikillm.services;

import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.dto.ReindexProgress;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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
            documents.add(readDocument(filePaths.get(i)));
            onProgress.accept(new ReindexProgress(i + 1, total));
        }
        repository.replaceDocuments(documents);
        return documents;
    }

    private DocumentRecord readDocument(Path path) {
        try {
            String relativePath =
                    pathResolver
                            .vaultRoot()
                            .relativize(path.toAbsolutePath().normalize())
                            .toString()
                            .replace('\\', '/');
            if (!relativePath.startsWith("wiki/")) {
                throw new IllegalArgumentException(
                        "Reindex only accepts wiki paths: " + relativePath);
            }
            String body = Files.readString(path, StandardCharsets.UTF_8);
            MarkdownDocument markdown = markdownService.parse(body);
            Object frontmatterType = markdown.frontmatter().get("type");
            String docType =
                    frontmatterType == null || frontmatterType.toString().isBlank()
                            ? inferDocType(relativePath)
                            : frontmatterType.toString();
            String title =
                    markdown.title().isBlank() ? titleFromPath(relativePath) : markdown.title();
            Instant updated = Files.getLastModifiedTime(path).toInstant();
            return new DocumentRecord(
                    UUID.nameUUIDFromBytes(relativePath.getBytes(StandardCharsets.UTF_8)),
                    relativePath,
                    title,
                    docType,
                    updated,
                    body);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read markdown document: " + path, ex);
        }
    }

    private String inferDocType(String path) {
        String[] parts = path.split("/");
        return parts.length > 1 ? parts[1].replaceAll("s$", "") : "note";
    }

    private String titleFromPath(String path) {
        String file = Path.of(path).getFileName().toString().replaceFirst("\\.md$", "");
        String[] words = file.split("-");
        StringBuilder title = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) {
                continue;
            }
            if (!title.isEmpty()) {
                title.append(' ');
            }
            title.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return title.toString();
    }
}
