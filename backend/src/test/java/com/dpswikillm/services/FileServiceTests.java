package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FileServiceTests {

    @TempDir
    Path vault;

    @Test
    void renderPdfMarkdownResolvesObsidianImageEmbeds() throws Exception {
        Files.createDirectories(vault.resolve("resources"));
        Files.writeString(vault.resolve("resources/Pasted image 20260618163907.png"), "png");
        ResourceSettingsService resourceSettingsService = mock(ResourceSettingsService.class);
        when(resourceSettingsService.resolveResourcePath("Pasted image 20260618163907.png"))
                .thenReturn("resources/Pasted image 20260618163907.png");
        FileService service = new FileService(
                resolver(),
                mock(SnapshotService.class),
                mock(WebDavSyncService.class),
                resourceSettingsService);

        String rendered = service.renderPdfMarkdown("before\n![[Pasted image 20260618163907.png]]\nafter");

        assertThat(rendered).contains("![Pasted image 20260618163907.png](<file:");
        assertThat(rendered).contains(">){.obsidian-resource-image}");
        assertThat(rendered).doesNotContain("![[Pasted image 20260618163907.png]]");
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(new AppProperties(
                vault.toString(),
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null, null));
    }
}
