package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.github.sardine.DavResource;
import com.github.sardine.Sardine;
import com.github.sardine.SardineFactory;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Thin wrapper around the Sardine WebDAV client. All library-specific concerns (credentials,
 * path→URL encoding, MKCOL of parent collections, PROPFIND walking) are isolated here so the rest
 * of the code stays library-agnostic.
 *
 * <p>When {@code WEBDAV_URL} is blank the client is disabled: mutating calls are no-ops and reads
 * return empty, so local editing keeps working without WebDAV.
 */
@Component
public class WebDavClient {

    private static final Logger log = LoggerFactory.getLogger(WebDavClient.class);

    private final AppProperties.WebDav config;
    private final String baseUrl;
    private final String basePath;

    public WebDavClient(AppProperties properties) {
        this.config = properties.webdav();
        String url = config.url() == null ? "" : config.url().trim();
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        this.baseUrl = url;
        String path = "";
        if (!url.isBlank()) {
            try {
                path = URI.create(url).getPath();
            } catch (RuntimeException e) {
                path = "";
            }
        }
        this.basePath = trimSlashes(path == null ? "" : path);
    }

    public boolean isEnabled() {
        return config.isConfigured();
    }

    private Sardine sardine() {
        return SardineFactory.begin(config.username(), config.password());
    }

    /**
     * Maps a vault-relative path (possibly nested, with spaces/non-ASCII) to the absolute WebDAV
     * URL.
     */
    public String urlFor(String relPath) {
        StringBuilder sb = new StringBuilder(baseUrl);
        for (String segment : relPath.split("/")) {
            if (segment.isEmpty()) {
                continue;
            }
            sb.append('/').append(encodeSegment(segment));
        }
        return sb.toString();
    }

    static String encodeSegment(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20");
    }

    public void put(String relPath, String content) throws IOException {
        if (!isEnabled()) {
            return;
        }
        Sardine sardine = sardine();
        ensureParentCollections(sardine, relPath);
        sardine.put(
                urlFor(relPath),
                content.getBytes(StandardCharsets.UTF_8),
                "text/markdown; charset=utf-8");
    }

    public Optional<String> get(String relPath) throws IOException {
        if (!isEnabled()) {
            return Optional.empty();
        }
        Sardine sardine = sardine();
        String url = urlFor(relPath);
        if (!sardine.exists(url)) {
            return Optional.empty();
        }
        try (InputStream in = sardine.get(url)) {
            return Optional.of(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    public void delete(String relPath) throws IOException {
        if (!isEnabled()) {
            return;
        }
        Sardine sardine = sardine();
        String url = urlFor(relPath);
        if (sardine.exists(url)) {
            sardine.delete(url);
        }
    }

    public void move(String fromRel, String toRel) throws IOException {
        if (!isEnabled()) {
            return;
        }
        Sardine sardine = sardine();
        String fromUrl = urlFor(fromRel);
        if (!sardine.exists(fromUrl)) {
            // Nothing to move remotely; fall back to a fresh put by the caller if needed.
            return;
        }
        ensureParentCollections(sardine, toRel);
        sardine.move(fromUrl, urlFor(toRel));
    }

    /**
     * Returns the version key (ETag or Last-Modified) for a single file, or {@code null} if it
     * doesn't exist.
     */
    public String getEtag(String relPath) throws IOException {
        if (!isEnabled()) {
            return null;
        }
        String url = urlFor(relPath);
        Sardine sardine = sardine();
        if (!sardine.exists(url)) {
            return null;
        }
        List<DavResource> resources = sardine.list(url, 0);
        if (resources.isEmpty()) {
            return null;
        }
        DavResource r = resources.get(0);
        if (r.getEtag() != null) {
            return r.getEtag();
        }
        return r.getModified() != null ? r.getModified().toInstant().toString() : null;
    }

    /**
     * Lists every {@code .md} file under the base URL with its ETag.
     *
     * <p>Tries a single {@code Depth: infinity} PROPFIND first (one HTTP request for the whole
     * tree). Falls back to a recursive {@code Depth: 1} walk if the server rejects the infinity
     * request (some servers disable it for large vaults).
     */
    public List<RemoteEntry> list() throws IOException {
        if (!isEnabled()) {
            return List.of();
        }
        Sardine sardine = sardine();
        try {
            return listInfinity(sardine);
        } catch (IOException e) {
            log.debug(
                    "Depth:infinity PROPFIND failed ({}), falling back to recursive walk",
                    e.getMessage());
            List<RemoteEntry> out = new ArrayList<>();
            walk(sardine, "", out);
            return out;
        }
    }

    private List<RemoteEntry> listInfinity(Sardine sardine) throws IOException {
        List<DavResource> resources = sardine.list(baseUrl + "/", -1);
        List<RemoteEntry> out = new ArrayList<>();
        for (DavResource resource : resources) {
            if (!resource.isDirectory()) {
                String rel = relativePath(resource);
                if (!rel.isEmpty() && rel.endsWith(".md")) {
                    String lastModified =
                            resource.getModified() != null
                                    ? resource.getModified().toInstant().toString()
                                    : null;
                    out.add(new RemoteEntry(rel, resource.getEtag(), lastModified));
                }
            }
        }
        return out;
    }

    private void walk(Sardine sardine, String relDir, List<RemoteEntry> out) throws IOException {
        String dirUrl = (relDir.isEmpty() ? baseUrl : urlFor(relDir)) + "/";
        List<DavResource> resources;
        try {
            resources = sardine.list(dirUrl, 1);
        } catch (IOException e) {
            log.debug("PROPFIND failed for {}: {}", dirUrl, e.getMessage());
            return;
        }
        for (DavResource resource : resources) {
            String rel = relativePath(resource);
            if (rel.isEmpty() || rel.equals(relDir)) {
                continue; // the collection being listed
            }
            if (resource.isDirectory()) {
                walk(sardine, rel, out);
            } else if (rel.endsWith(".md")) {
                String lastModified =
                        resource.getModified() != null
                                ? resource.getModified().toInstant().toString()
                                : null;
                out.add(new RemoteEntry(rel, resource.getEtag(), lastModified));
            }
        }
    }

    private String relativePath(DavResource resource) {
        String path = trimSlashes(resource.getPath() == null ? "" : resource.getPath());
        if (basePath.isEmpty()) {
            return path;
        }
        if (path.equals(basePath)) {
            return "";
        }
        if (path.startsWith(basePath + "/")) {
            return path.substring(basePath.length() + 1);
        }
        return path;
    }

    private void ensureParentCollections(Sardine sardine, String relPath) throws IOException {
        int lastSlash = relPath.lastIndexOf('/');
        if (lastSlash < 0) {
            return;
        }
        String[] segments = relPath.substring(0, lastSlash).split("/");
        StringBuilder rel = new StringBuilder();
        for (String segment : segments) {
            if (segment.isEmpty()) {
                continue;
            }
            if (rel.length() > 0) {
                rel.append('/');
            }
            rel.append(segment);
            String dirUrl = urlFor(rel.toString());
            if (!sardine.exists(dirUrl)) {
                sardine.createDirectory(dirUrl);
            }
        }
    }

    private static String trimSlashes(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && value.charAt(start) == '/') {
            start++;
        }
        while (end > start && value.charAt(end - 1) == '/') {
            end--;
        }
        return value.substring(start, end);
    }

    public record RemoteEntry(String path, String etag, String lastModified) {
        /**
         * ETag if available, otherwise the ISO Last-Modified string. Used as an opaque version key.
         */
        public String versionKey() {
            return etag != null ? etag : lastModified;
        }
    }
}
