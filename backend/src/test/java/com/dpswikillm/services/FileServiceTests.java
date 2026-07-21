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

    @Test
    void stripsFrontmatterTitleWhenBodyRepeatsItAsHeading() {
        String markdown = """
                ---
                title: "Code Is Cheap Now"
                source: upload
                ---
                # Code Is Cheap Now

                Body text.
                """;

        String result = service().stripDuplicateFrontmatterTitle(markdown);

        assertThat(result).doesNotContain("title: \"Code Is Cheap Now\"");
        assertThat(result).contains("source: upload");
        assertThat(result).contains("# Code Is Cheap Now");
        // The title survives exactly once, as the body heading.
        assertThat(result.split("Code Is Cheap Now", -1)).hasSize(2);
    }

    @Test
    void keepsFrontmatterTitleWhenBodyHasNoMatchingHeading() {
        String markdown = """
                ---
                title: "Only In Frontmatter"
                source: upload
                ---
                Body text without a matching heading.
                """;

        String result = service().stripDuplicateFrontmatterTitle(markdown);

        assertThat(result).isEqualTo(markdown);
    }

    @Test
    void leavesMarkdownUntouchedWhenThereIsNoFrontmatter() {
        String markdown = "# Some Heading\n\nJust body content.\n";

        assertThat(service().stripDuplicateFrontmatterTitle(markdown)).isEqualTo(markdown);
    }

    @Test
    void leavesMarkdownUntouchedWhenFrontmatterHasNoTitle() {
        String markdown = """
                ---
                source: upload
                filename: note.md
                ---
                # Some Heading

                Body.
                """;

        assertThat(service().stripDuplicateFrontmatterTitle(markdown)).isEqualTo(markdown);
    }

    @Test
    void stripsFrontmatterTitleWhenBodyHasH1WithDifferentText() {
        String markdown = """
                ---
                title: "My Note"
                source: upload
                ---
                # A Different Heading

                Body text.
                """;

        String result = service().stripDuplicateFrontmatterTitle(markdown);

        assertThat(result).doesNotContain("title: \"My Note\"");
        assertThat(result).contains("source: upload");
        assertThat(result).contains("# A Different Heading");
    }

    @Test
    void keepsFrontmatterTitleWhenBodyHasOnlyDeeperHeadings() {
        String markdown = """
                ---
                title:   "Mi segundo cerebro: una wiki"
                source: upload
                ---
                ##   Mi segundo cerebro: una wiki\s

                Body text.
                """;

        String result = service().stripDuplicateFrontmatterTitle(markdown);

        assertThat(result).contains("title:");
        assertThat(result).contains("source: upload");
        assertThat(result).contains("Mi segundo cerebro: una wiki");
    }

    private FileService service() {
        return new FileService(
                resolver(),
                mock(SnapshotService.class),
                mock(WebDavSyncService.class),
                mock(ResourceSettingsService.class));
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(new AppProperties(
                vault.toString(),
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1), 8),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null, null));
    }
}
