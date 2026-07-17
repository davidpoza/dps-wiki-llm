package com.dpswikillm.services;

import com.dpswikillm.domain.Snapshot;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class FileService {

    private static final Logger log = LoggerFactory.getLogger(FileService.class);

    private final VaultPathResolver pathResolver;
    private final SnapshotService snapshotService;

    public FileService(VaultPathResolver pathResolver, SnapshotService snapshotService) {
        this.pathResolver = pathResolver;
        this.snapshotService = snapshotService;
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
                if (name.startsWith(".")) continue;
                String relativePath = root.relativize(entry).toString().replace('\\', '/');
                if (Files.isDirectory(entry)) {
                    List<TreeNodeDto> children = buildChildren(entry, root);
                    nodes.add(new TreeNodeDto(relativePath, name, relativePath, "pi pi-folder", false, children));
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
        Snapshot snapshot = snapshotService.beginSnapshot(null, "manual-save", relativePath);
        try {
            snapshotService.captureFile(snapshot, relativePath);
            Files.writeString(resolved, content, StandardCharsets.UTF_8);
            snapshotService.recordAfter(snapshot, relativePath);
            snapshotService.finalizeSnapshot(snapshot, null);
        } catch (IOException e) {
            snapshotService.deleteSnapshot(snapshot.getId());
            throw new UncheckedIOException(e);
        }
    }

    public void deleteFile(String relativePath) {
        Path resolved = resolveAndValidate(relativePath);
        if (!Files.exists(resolved)) {
            throw new NoSuchFileException(relativePath);
        }
        String filename = resolved.getFileName().toString();
        try {
            Files.delete(resolved);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void renameFile(String relativePath, String newName) {
        if (newName == null || newName.isBlank()) {
            throw new IllegalArgumentException("New name is required");
        }
        if (newName.contains("/") || newName.contains("\\")) {
            throw new IllegalArgumentException("New name must not contain path separators");
        }
        Path resolved = resolveAndValidate(relativePath);
        if (!Files.exists(resolved)) {
            throw new NoSuchFileException(relativePath);
        }
        Path target = resolved.resolveSibling(newName).normalize();
        if (!target.startsWith(pathResolver.vaultRoot())) {
            throw new IllegalArgumentException("Target path escapes vault root");
        }
        if (Files.exists(target)) {
            throw new FileAlreadyExistsException(newName);
        }
        String oldName = resolved.getFileName().toString();
        try {
            Files.move(resolved, target);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void moveFile(String relativePath, String targetDirRelPath) {
        Path source = resolveAndValidate(relativePath);
        if (!Files.exists(source)) {
            throw new NoSuchFileException(relativePath);
        }
        Path targetDir;
        String normalizedDir;
        if (targetDirRelPath == null || targetDirRelPath.isBlank()) {
            targetDir = pathResolver.vaultRoot();
            normalizedDir = "";
        } else {
            normalizedDir = pathResolver.normalizeRelativePath(targetDirRelPath);
            targetDir = pathResolver.resolve(normalizedDir);
        }
        if (!Files.isDirectory(targetDir)) {
            throw new IllegalArgumentException("Target is not a directory: " + targetDirRelPath);
        }
        String filename = source.getFileName().toString();
        Path target = targetDir.resolve(filename).normalize();
        if (!target.startsWith(pathResolver.vaultRoot())) {
            throw new IllegalArgumentException("Target path escapes vault root");
        }
        if (Files.exists(target)) {
            throw new FileAlreadyExistsException(filename);
        }
        String newRelPath = pathResolver.vaultRoot().relativize(target).toString().replace('\\', '/');
        try {
            Files.move(source, target);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void createDirectory(String relativePath) {
        Path resolved = resolveAndValidate(relativePath);
        if (Files.exists(resolved)) {
            throw new FileAlreadyExistsException(relativePath);
        }
        try {
            Files.createDirectories(resolved);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void createFile(String relativePath) {
        Path resolved = resolveAndValidate(relativePath);
        if (Files.exists(resolved)) {
            throw new FileAlreadyExistsException(relativePath);
        }
        if (!Files.isDirectory(resolved.getParent())) {
            throw new IllegalArgumentException("Parent directory does not exist: " + relativePath);
        }
        try {
            Files.createFile(resolved);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public byte[] exportPdf(String relativePath) {
        Path input = resolveAndValidate(relativePath);
        if (!Files.exists(input)) throw new NoSuchFileException(relativePath);
        Path output = null;
        try {
            output = Files.createTempFile("wiki-pdf-", ".pdf");
            ProcessBuilder pb = new ProcessBuilder(
                    "pandoc", input.toString(),
                    "--pdf-engine=weasyprint",
                    "-o", output.toString()
            );
            pb.environment().put("TMPDIR", "/tmp");
            pb.redirectErrorStream(true);
            Process process = pb.start();
            String stderr = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exit = process.waitFor();
            if (exit != 0) {
                log.error("pandoc failed (exit {}): {}", exit, stderr);
                throw new PdfExportException("pandoc exited with code " + exit);
            }
            return Files.readAllBytes(output);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("PDF export interrupted", e);
        } finally {
            if (output != null) {
                try { Files.deleteIfExists(output); } catch (IOException ignored) {}
            }
        }
    }

    private Path resolveAndValidate(String relativePath) {
        // VaultPathResolver.normalizeRelativePath already enforces no traversal
        String normalized = pathResolver.normalizeRelativePath(relativePath);
        return pathResolver.resolve(normalized);
    }

    public static final class NoSuchFileException extends RuntimeException {
        public NoSuchFileException(String path) { super(path); }
    }

    public static final class FileAlreadyExistsException extends RuntimeException {
        public FileAlreadyExistsException(String path) { super(path); }
    }

    public static final class PdfExportException extends RuntimeException {
        public PdfExportException(String msg) { super(msg); }
    }
}
