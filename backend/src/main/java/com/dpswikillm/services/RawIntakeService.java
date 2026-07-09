package com.dpswikillm.services;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class RawIntakeService {
    private static final long MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
    private static final int MAX_FETCHED_CHARS = 500_000;

    private final VaultPathResolver pathResolver;

    public RawIntakeService(VaultPathResolver pathResolver) {
        this.pathResolver = pathResolver;
    }

    public String ingestMarkdown(MultipartFile file) throws IOException {
        String filename = file.getOriginalFilename() == null ? "upload.md" : file.getOriginalFilename();
        if (!filename.endsWith(".md") && !filename.endsWith(".markdown")) {
            throw new IllegalArgumentException("Only markdown uploads are supported");
        }
        if (file.getSize() > MAX_MARKDOWN_BYTES) {
            throw new IllegalArgumentException("Markdown upload exceeds size limit");
        }
        MediaType mediaType = file.getContentType() == null ? null : MediaType.parseMediaType(file.getContentType());
        if (mediaType != null && !MediaType.TEXT_PLAIN.includes(mediaType)
                && !mediaType.toString().equals("text/markdown")
                && !mediaType.toString().equals("application/octet-stream")) {
            throw new IllegalArgumentException("Unsupported markdown content type: " + mediaType);
        }
        String slug = TextUtil.slugify(filename.replaceFirst("\\.[^.]+$", ""), "upload");
        String rawPath = "raw/inbox/" + Instant.now().toString().replace(":", "-") + "-" + slug + ".md";
        writeRaw(rawPath, new String(file.getBytes(), StandardCharsets.UTF_8));
        return rawPath;
    }

    public String ingestUrl(String url) throws IOException {
        URI uri = URI.create(url);
        if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Only http(s) URLs are supported");
        }
        org.jsoup.nodes.Document document = Jsoup.connect(url)
                .timeout(10_000)
                .maxBodySize(MAX_FETCHED_CHARS)
                .get();
        String title = document.title().isBlank() ? uri.getHost() : document.title();
        String cleanHtml = Jsoup.clean(document.body().html(), uri.toString(), Safelist.basic());
        String text = Jsoup.parse(cleanHtml).text();
        String content = "# " + title + "\n\nSource URL: " + url + "\n\n" + text;
        String slug = TextUtil.slugify(title, "web-source");
        String rawPath = "raw/web/" + Instant.now().toString().replace(":", "-") + "-" + slug + ".md";
        writeRaw(rawPath, content);
        return rawPath;
    }

    private void writeRaw(String rawPath, String content) throws IOException {
        Path path = pathResolver.resolve(rawPath);
        Files.createDirectories(path.getParent());
        Files.writeString(path, content, StandardCharsets.UTF_8);
    }
}
