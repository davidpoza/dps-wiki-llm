package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import java.nio.file.Path;
import org.springframework.stereotype.Service;

@Service
public class VaultPathResolver {
    private final Path vaultRoot;

    public VaultPathResolver(AppProperties properties) {
        this.vaultRoot = properties.vaultPath().toAbsolutePath().normalize();
    }

    public Path resolve(String vaultRelativePath) {
        return vaultRoot.resolve(normalizeRelativePath(vaultRelativePath)).normalize();
    }

    public String normalizeRelativePath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new IllegalArgumentException("Vault path is required");
        }
        String candidate = rawPath.replace('\\', '/').trim();
        if (candidate.startsWith("/") || candidate.matches("^[A-Za-z]:/.*")) {
            throw new IllegalArgumentException("Absolute paths are not allowed: " + rawPath);
        }

        Path resolved = vaultRoot.resolve(candidate).normalize();
        if (!resolved.startsWith(vaultRoot)) {
            throw new IllegalArgumentException("Path escapes vault root: " + rawPath);
        }
        return vaultRoot.relativize(resolved).toString().replace('\\', '/');
    }

    public Path vaultRoot() {
        return vaultRoot;
    }
}
