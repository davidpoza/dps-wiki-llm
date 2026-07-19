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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class FileService {

    private static final Logger log = LoggerFactory.getLogger(FileService.class);
    private static final Pattern OBSIDIAN_IMAGE_EMBED = Pattern.compile("!\\[\\[([^\\]\\n]+)\\]\\]");
    private static final Pattern IMAGE_EXTENSION = Pattern.compile("(?i)\\.(png|jpe?g|gif|webp|svg)$");

    private final VaultPathResolver pathResolver;
    private final SnapshotService snapshotService;
    private final WebDavSyncService webDavSyncService;
    private final ResourceSettingsService resourceSettingsService;

    public FileService(VaultPathResolver pathResolver,
                       SnapshotService snapshotService,
                       WebDavSyncService webDavSyncService,
                       ResourceSettingsService resourceSettingsService) {
        this.pathResolver = pathResolver;
        this.snapshotService = snapshotService;
        this.webDavSyncService = webDavSyncService;
        this.resourceSettingsService = resourceSettingsService;
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

    public byte[] getBinaryContent(String relativePath) {
        Path resolved = resolveAndValidate(relativePath);
        if (!Files.exists(resolved) || !Files.isRegularFile(resolved)) {
            throw new NoSuchFileException(relativePath);
        }
        try {
            return Files.readAllBytes(resolved);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void saveContent(String relativePath, String content) {
        Path resolved = resolveAndValidate(relativePath);
        Snapshot snapshot = snapshotService.beginSnapshot(null, "manual-save", relativePath, "LOCAL_EDIT");
        try {
            snapshotService.captureFile(snapshot, relativePath);
            Files.writeString(resolved, content, StandardCharsets.UTF_8);
            snapshotService.recordAfter(snapshot, relativePath);
            snapshotService.finalizeSnapshot(snapshot, null);
        } catch (IOException e) {
            snapshotService.deleteSnapshot(snapshot.getId());
            throw new UncheckedIOException(e);
        }
        // Local write + history are durable; now replicate the single file to WebDAV.
        webDavSyncService.pushSaved(relativePath, content);
    }

    public void deleteFile(String relativePath) {
        Path resolved = resolveAndValidate(relativePath);
        if (!Files.exists(resolved)) {
            throw new NoSuchFileException(relativePath);
        }
        try {
            Files.delete(resolved);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        webDavSyncService.pushDeleted(relativePath);
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
        String oldRel = pathResolver.normalizeRelativePath(relativePath);
        String newRel = pathResolver.vaultRoot().relativize(target).toString().replace('\\', '/');
        String content;
        try {
            Files.move(resolved, target);
            content = Files.readString(target, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        webDavSyncService.pushMoved(oldRel, newRel, content);
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
        String oldRel = pathResolver.normalizeRelativePath(relativePath);
        String newRelPath = pathResolver.vaultRoot().relativize(target).toString().replace('\\', '/');
        String content;
        try {
            Files.move(source, target);
            content = Files.readString(target, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        webDavSyncService.pushMoved(oldRel, newRelPath, content);
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
        Path renderedInput = null;
        Path stylesheet = null;
        Path output = null;
        try {
            String markdown = Files.readString(input, StandardCharsets.UTF_8);
            renderedInput = Files.createTempFile("wiki-pdf-input-", ".md");
            stylesheet = Files.createTempFile("wiki-pdf-style-", ".css");
            output = Files.createTempFile("wiki-pdf-", ".pdf");
            Files.writeString(renderedInput, renderPdfMarkdown(markdown), StandardCharsets.UTF_8);
            Files.writeString(stylesheet, pdfStylesheet(), StandardCharsets.UTF_8);
            ProcessBuilder pb = new ProcessBuilder(
                    "pandoc", renderedInput.toString(),
                    "--pdf-engine=weasyprint",
                    "--standalone",
                    "--highlight-style", "kate",
                    "--css", stylesheet.toString(),
                    "-o", output.toString()
            );
            pb.environment().put("TMPDIR", "/tmp");
            pb.directory(new java.io.File("/tmp"));
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
            if (renderedInput != null) {
                try { Files.deleteIfExists(renderedInput); } catch (IOException ignored) {}
            }
            if (stylesheet != null) {
                try { Files.deleteIfExists(stylesheet); } catch (IOException ignored) {}
            }
            if (output != null) {
                try { Files.deleteIfExists(output); } catch (IOException ignored) {}
            }
        }
    }

    String renderPdfMarkdown(String markdown) {
        Matcher matcher = OBSIDIAN_IMAGE_EMBED.matcher(markdown == null ? "" : markdown);
        StringBuilder rendered = new StringBuilder();
        while (matcher.find()) {
            String rawTarget = matcher.group(1);
            String target = cleanObsidianTarget(rawTarget);
            if (!IMAGE_EXTENSION.matcher(target).find()) {
                matcher.appendReplacement(rendered, Matcher.quoteReplacement(matcher.group(0)));
                continue;
            }
            try {
                String resourcePath = resourceSettingsService.resolveResourcePath(target);
                Path imagePath = pathResolver.resolve(resourcePath);
                if (!Files.isRegularFile(imagePath)) {
                    matcher.appendReplacement(rendered, Matcher.quoteReplacement(matcher.group(0)));
                    continue;
                }
                String alt = target.contains("/")
                        ? target.substring(target.lastIndexOf('/') + 1)
                        : target;
                String replacement = "![" + alt.replace("]", "\\]") + "](<" + imagePath.toUri() + ">){.obsidian-resource-image}";
                matcher.appendReplacement(rendered, Matcher.quoteReplacement(replacement));
            } catch (IllegalArgumentException | UncheckedIOException ex) {
                matcher.appendReplacement(rendered, Matcher.quoteReplacement(matcher.group(0)));
            }
        }
        matcher.appendTail(rendered);
        return rendered.toString();
    }

    private String cleanObsidianTarget(String rawTarget) {
        return rawTarget
                .split("\\|", 2)[0]
                .split("#", 2)[0]
                .trim()
                .replace('\\', '/');
    }

    private String pdfStylesheet() {
        return """
                /* ── Page layout ── */
                @page {
                  size: A4;
                  margin: 2cm 2.5cm;
                }

                /* ── Body typography ── */
                body {
                  font-family: sans-serif;
                  font-size: 11pt;
                  line-height: 1.6;
                  color: #24292f;
                }

                /* ── Headings ── */
                h1, h2, h3, h4, h5, h6 {
                  font-weight: 700;
                  margin-top: 1.2em;
                  margin-bottom: 0.4em;
                  line-height: 1.25;
                }
                h1 { font-size: 2em;    border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em; }
                h2 { font-size: 1.5em;  }
                h3 { font-size: 1.25em; }
                h4 { font-size: 1.05em; }
                h5 { font-size: 0.9em;  }
                h6 { font-size: 0.85em; color: #57606a; }

                /* ── Inline formatting ── */
                strong, b { font-weight: 700; }
                em, i     { font-style: italic; }

                a {
                  color: #0969da;
                  text-decoration: underline;
                }
                a::after {
                  content: " (" attr(href) ")";
                  font-size: 0.8em;
                  word-break: break-all;
                  color: #57606a;
                }

                /* ── Lists ── */
                ul { list-style: disc;    padding-left: 1.75em; margin: 0.5em 0; }
                ol { list-style: decimal; padding-left: 1.75em; margin: 0.5em 0; }
                li { margin: 0.25em 0; }
                ul ul, ol ul { list-style: circle; }
                ul ol, ol ol { list-style: lower-alpha; }

                /* ── Blockquotes ── */
                blockquote {
                  border-left: 4px solid #d0d7de;
                  padding: 0.25em 1em;
                  margin: 1em 0;
                  color: #57606a;
                }

                /* ── Code ── */
                code {
                  font-family: monospace;
                  font-size: 0.9em;
                  background: #f6f8fa;
                  padding: 0.1em 0.35em;
                  border-radius: 4px;
                  border: 1px solid #d0d7de;
                }
                pre {
                  background: #f6f8fa;
                  border: 1px solid #d0d7de;
                  border-radius: 6px;
                  padding: 1em;
                  overflow-x: auto;
                  white-space: pre-wrap;
                  word-break: break-all;
                  margin: 1em 0;
                }
                pre code {
                  background: none;
                  border: none;
                  padding: 0;
                  font-size: inherit;
                }

                /* ── Tables ── */
                table {
                  border-collapse: collapse;
                  width: 100%;
                  margin: 1em 0;
                  font-size: 0.95em;
                }
                th, td {
                  border: 1px solid #d0d7de;
                  padding: 0.4em 0.75em;
                  text-align: left;
                }
                thead th {
                  background: #f6f8fa;
                  font-weight: 700;
                }
                tbody tr:nth-child(even) {
                  background: #f8f9fa;
                }

                /* ── Images (standard markdown) ── */
                img {
                  display: block;
                  max-width: 100%;
                  max-height: 20cm;
                  height: auto;
                  margin: 1rem auto;
                }

                /* ── Obsidian-embedded images ── */
                img.obsidian-resource-image {
                  object-fit: contain;
                  padding: 0.35rem;
                  border: 1px solid #d0d7de;
                  border-radius: 6px;
                  background: #f6f8fa;
                }
                figure {
                  break-inside: avoid;
                }
                """;
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
