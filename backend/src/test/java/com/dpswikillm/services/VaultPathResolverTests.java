package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dpswikillm.config.AppProperties;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VaultPathResolverTests {
    @TempDir Path vault;

    @Test
    void rejectsTraversalOutsideVault() {
        VaultPathResolver resolver = resolver();

        assertThatThrownBy(() -> resolver.normalizeRelativePath("../outside.md"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("escapes vault root");
    }

    @Test
    void normalizesToPosixRelativePath() {
        VaultPathResolver resolver = resolver();

        assertThat(resolver.normalizeRelativePath("wiki\\concepts\\demo.md"))
                .isEqualTo("wiki/concepts/demo.md");
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(
                new AppProperties(
                        vault.toString(),
                        List.of("http://localhost:4200"),
                        new AppProperties.Embeddings(
                                "http://embeddings:8080",
                                "multilingual-e5-small",
                                "",
                                384,
                                Duration.ofSeconds(1),
                                8),
                        new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                        new AppProperties.Telegram("", ""),
                        null,
                        null,
                        null,
                        null));
    }
}
