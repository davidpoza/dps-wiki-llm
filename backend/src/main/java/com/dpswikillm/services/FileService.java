package com.dpswikillm.services;

import com.dpswikillm.dto.TreeNodeDto;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class FileService {

    private final VaultPathResolver pathResolver;

    public FileService(VaultPathResolver pathResolver) {
        this.pathResolver = pathResolver;
    }

    public List<TreeNodeDto> getTree() {
        Path root = pathResolver.vaultRoot();
        if (!Files.exists(root)) {
            return List.of();
        }
        try {
            return buildChildren(root, root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private List<TreeNodeDto> buildChildren(Path dir, Path root) throws IOException {
        List<TreeNodeDto> nodes = new ArrayList<>();
        try (var stream = Files.list(dir).sorted(Comparator.comparing(p -> p.getFileName().toString().toLowerCase()))) {
            for (Path entry : (Iterable<Path>) stream::iterator) {
                String name = entry.getFileName().toString();
                String relativePath = root.relativize(entry).toString().replace('\\', '/');
                if (Files.isDirectory(entry)) {
                    List<TreeNodeDto> children = buildChildren(entry, root);
                    if (!children.isEmpty()) {
                        nodes.add(new TreeNodeDto(relativePath, name, relativePath, "pi pi-folder", false, children));
                    }
                } else if (name.endsWith(".md")) {
                    nodes.add(new TreeNodeDto(relativePath, name, relativePath, "pi pi-file", true, null));
                }
            }
        }
        return nodes;
    }

    public String getContent(String relativePath) {
        Path resolved = resolveAndValidate(relativePath);
        try {
            return Files.readString(resolved, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void saveContent(String relativePath, String content) {
        Path resolved = resolveAndValidate(relativePath);
        try {
            Files.writeString(resolved, content, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Path resolveAndValidate(String relativePath) {
        // VaultPathResolver.normalizeRelativePath already enforces no traversal
        String normalized = pathResolver.normalizeRelativePath(relativePath);
        return pathResolver.resolve(normalized);
    }
}
