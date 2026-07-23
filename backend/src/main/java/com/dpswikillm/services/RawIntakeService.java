package com.dpswikillm.services;

import com.dpswikillm.services.WebExtractorClient.ExtractionMetadata;
import com.dpswikillm.services.WebExtractorClient.ExtractionResult;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class RawIntakeService {
    private static final long MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;

    private final VaultPathResolver pathResolver;
    private final WebExtractorClient extractorClient;

    public RawIntakeService(VaultPathResolver pathResolver, WebExtractorClient extractorClient) {
        this.pathResolver = pathResolver;
        this.extractorClient = extractorClient;
    }

    public String ingestFile(MultipartFile file) throws IOException {
        String filename =
                file.getOriginalFilename() == null ? "upload" : file.getOriginalFilename();
        if (filename.endsWith(".pdf")) {
            return ingestPdf(file, filename);
        }
        if (filename.endsWith(".md") || filename.endsWith(".markdown")) {
            return ingestMarkdown(file, filename);
        }
        throw new IllegalArgumentException("Unsupported file type. Send a .pdf or .md file");
    }

    private String ingestPdf(MultipartFile file, String filename) throws IOException {
        ExtractionResult result = extractorClient.extractFile(file);
        ExtractionMetadata meta = result.metadata();
        String title =
                meta != null && meta.title() != null && !meta.title().isBlank()
                        ? meta.title()
                        : filename.replaceFirst("\\.[^.]+$", "");
        String content =
                renderFileFrontmatter(filename, meta)
                        + "\n# "
                        + title
                        + "\n\n"
                        + result.markdown().strip()
                        + "\n";
        String slug = TextUtil.slugify(title, "pdf-upload");
        String rawPath =
                "raw/inbox/" + Instant.now().toString().replace(":", "-") + "-" + slug + ".md";
        writeRaw(rawPath, content);
        return rawPath;
    }

    private String ingestMarkdown(MultipartFile file, String filename) throws IOException {
        if (file.getSize() > MAX_MARKDOWN_BYTES) {
            throw new IllegalArgumentException("Markdown upload exceeds size limit");
        }
        MediaType mediaType =
                file.getContentType() == null
                        ? null
                        : MediaType.parseMediaType(file.getContentType());
        if (mediaType != null
                && !MediaType.TEXT_PLAIN.includes(mediaType)
                && !mediaType.toString().equals("text/markdown")
                && !mediaType.toString().equals("application/octet-stream")) {
            throw new IllegalArgumentException("Unsupported markdown content type: " + mediaType);
        }
        String slug = TextUtil.slugify(filename.replaceFirst("\\.[^.]+$", ""), "upload");
        String rawPath =
                "raw/inbox/" + Instant.now().toString().replace(":", "-") + "-" + slug + ".md";
        writeRaw(rawPath, new String(file.getBytes(), StandardCharsets.UTF_8));
        return rawPath;
    }

    public String ingestText(String content, String title) throws IOException {
        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("Markdown content must not be empty");
        }
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_MARKDOWN_BYTES) {
            throw new IllegalArgumentException("Markdown content exceeds size limit");
        }
        String base = (title != null && !title.isBlank()) ? title : "clipboard";
        String slug = TextUtil.slugify(base, "clipboard");
        String rawPath =
                "raw/inbox/" + Instant.now().toString().replace(":", "-") + "-" + slug + ".md";
        writeRaw(rawPath, content);
        return rawPath;
    }

    /**
     * Fetch a URL through the {@code web-extractor} microservice (real browser rendering) and
     * persist the resulting structured markdown with YAML frontmatter under {@code raw/web/**}.
     */
    public String ingestUrl(String url) throws IOException {
        URI uri = URI.create(url);
        if (!"http".equalsIgnoreCase(uri.getScheme())
                && !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Only http(s) URLs are supported");
        }
        ExtractionResult result = extractorClient.extract(url);
        ExtractionMetadata meta = result.metadata();

        String title =
                meta != null && meta.title() != null && !meta.title().isBlank()
                        ? meta.title()
                        : uri.getHost();
        String content =
                renderFrontmatter(url, meta)
                        + "\n# "
                        + title
                        + "\n\n"
                        + result.markdown().strip()
                        + "\n";
        String slug = TextUtil.slugify(title, "web-source");
        String rawPath =
                "raw/web/" + Instant.now().toString().replace(":", "-") + "-" + slug + ".md";
        writeRaw(rawPath, content);
        return rawPath;
    }

    private String renderFileFrontmatter(String filename, ExtractionMetadata meta) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("source", "upload");
        fields.put("filename", filename);
        if (meta != null) {
            putIfPresent(fields, "title", meta.title());
            putIfPresent(fields, "extraction_confidence", meta.extractionConfidence());
        }
        StringBuilder sb = new StringBuilder("---\n");
        fields.forEach((k, v) -> sb.append(k).append(": ").append(yamlValue(v)).append('\n'));
        sb.append("---\n");
        return sb.toString();
    }

    private String renderFrontmatter(String requestedUrl, ExtractionMetadata meta) {
        Map<String, String> fields = new LinkedHashMap<>();
        String sourceUrl = meta != null && meta.finalUrl() != null ? meta.finalUrl() : requestedUrl;
        fields.put("source_url", sourceUrl);
        if (meta != null) {
            putIfPresent(fields, "canonical_url", meta.canonicalUrl());
            putIfPresent(fields, "title", meta.title());
            putIfPresent(fields, "author", meta.author());
            putIfPresent(fields, "published", meta.published());
            putIfPresent(fields, "site", meta.siteName());
            putIfPresent(fields, "lang", meta.lang());
            putIfPresent(fields, "extraction_confidence", meta.extractionConfidence());
        }
        StringBuilder sb = new StringBuilder("---\n");
        fields.forEach((k, v) -> sb.append(k).append(": ").append(yamlValue(v)).append('\n'));
        sb.append("---\n");
        return sb.toString();
    }

    private static void putIfPresent(Map<String, String> fields, String key, String value) {
        if (value != null && !value.isBlank()) {
            fields.put(key, value);
        }
    }

    private static String yamlValue(String value) {
        // Always double-quote and escape to keep the frontmatter well-formed
        // regardless of colons, quotes, or other YAML-significant characters.
        return '"' + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + '"';
    }

    private void writeRaw(String rawPath, String content) throws IOException {
        Path path = pathResolver.resolve(rawPath);
        Files.createDirectories(path.getParent());
        Files.writeString(path, content, StandardCharsets.UTF_8);
    }
}
