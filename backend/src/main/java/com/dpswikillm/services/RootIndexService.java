package com.dpswikillm.services;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Service;

@Service
public class RootIndexService {
    private final VaultPathResolver pathResolver;

    public RootIndexService(VaultPathResolver pathResolver) {
        this.pathResolver = pathResolver;
    }

    public boolean addEntry(String title, String path) throws IOException {
        Path index = pathResolver.resolve("INDEX.md");
        Files.createDirectories(index.getParent());
        String entry = "- [[" + title + "]] (" + path + ")";
        String existing = Files.exists(index) ? Files.readString(index, StandardCharsets.UTF_8) : "# Index\n\n";
        if (existing.contains(entry)) {
            return false;
        }
        String separator = existing.endsWith("\n") ? "" : "\n";
        Files.writeString(index, existing + separator + entry + "\n", StandardCharsets.UTF_8);
        return true;
    }
}
