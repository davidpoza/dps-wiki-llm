package com.dpswikillm.controllers;

import com.dpswikillm.services.MarkdownService;
import com.dpswikillm.services.VaultPathResolver;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NoteListController {

    record NoteEntry(String path, String title, boolean hasKeywords) {}

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;

    public NoteListController(VaultPathResolver pathResolver, MarkdownService markdownService) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
    }

    @GetMapping("/notes/list")
    public List<NoteEntry> listNotes(@RequestParam List<String> folders) throws IOException {
        List<NoteEntry> result = new ArrayList<>();
        for (String folder : folders) {
            Path root = pathResolver.resolve(folder);
            if (!Files.exists(root)) {
                continue;
            }
            try (Stream<Path> paths = Files.walk(root)) {
                paths.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().endsWith(".md"))
                        .sorted()
                        .forEach(
                                abs -> {
                                    String rel =
                                            pathResolver
                                                    .vaultRoot()
                                                    .relativize(abs.toAbsolutePath().normalize())
                                                    .toString()
                                                    .replace('\\', '/');
                                    result.add(buildEntry(rel, abs));
                                });
            }
        }
        return result;
    }

    private NoteEntry buildEntry(String rel, Path abs) {
        String title = titleFromPath(rel);
        boolean hasKeywords = false;
        try {
            String body = Files.readString(abs, StandardCharsets.UTF_8);
            Object kw = markdownService.parse(body).frontmatter().get("keywords");
            hasKeywords = hasKeywords(kw);
        } catch (IOException ignored) {
        }
        return new NoteEntry(rel, title, hasKeywords);
    }

    private boolean hasKeywords(Object value) {
        if (value instanceof Iterable<?> items) {
            return items.iterator().hasNext();
        }
        return value != null && !value.toString().isBlank();
    }

    private String titleFromPath(String rel) {
        String filename = rel.contains("/") ? rel.substring(rel.lastIndexOf('/') + 1) : rel;
        if (filename.endsWith(".md")) {
            filename = filename.substring(0, filename.length() - 3);
        }
        return filename;
    }
}
