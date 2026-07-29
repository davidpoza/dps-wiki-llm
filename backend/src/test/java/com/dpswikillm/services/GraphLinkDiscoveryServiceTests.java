package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.services.LinkDiscoveryService.DiscoveredLink;
import com.dpswikillm.services.LinkDiscoveryService.LinkDiscoveryProgress;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class GraphLinkDiscoveryServiceTests {

    @TempDir Path vault;

    private GraphLinkDiscoveryService service;
    private static final Consumer<LinkDiscoveryProgress> NOOP = p -> {};

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties(vault.toString(), null, null, null, null, null, null, null, null);
        VaultPathResolver pathResolver = new VaultPathResolver(props);
        MarkdownService markdownService = new MarkdownService();
        WikiLinkResolver linkResolver = new WikiLinkResolver(pathResolver);
        GraphService graphService = new GraphService(pathResolver, markdownService, linkResolver);

        AppSettingRepository settings = mock(AppSettingRepository.class);
        when(settings.findById(anyString())).thenReturn(Optional.empty());

        service =
                new GraphLinkDiscoveryService(
                        pathResolver, markdownService, linkResolver, graphService, settings);
    }

    private void writeNote(String relPath, String content) throws IOException {
        Path file = vault.resolve(relPath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    @Test
    void lexSeedAndMultiHopNeighborSurface() throws IOException {
        // insulin --(keyword: pancreas)--> seeds pancreas; pancreas --[[glucagon]]--> multi-hop C.
        writeNote(
                "wiki/concepts/insulin.md",
                "---\nkeywords:\n  - pancreas\n---\n# Insulin\n\nBody text.\n");
        writeNote("wiki/concepts/pancreas.md", "# Pancreas\n\nSee [[glucagon]].\n");
        writeNote("wiki/concepts/glucagon.md", "# Glucagon\n\nA hormone.\n");

        List<DiscoveredLink> results = service.discover("wiki/concepts/insulin.md", NOOP);

        assertThat(results).extracting(DiscoveredLink::path).contains("wiki/concepts/pancreas.md");
        // glucagon is two hops away and was never lexically matched — only PPR surfaces it.
        assertThat(results).extracting(DiscoveredLink::path).contains("wiki/concepts/glucagon.md");
    }

    @Test
    void alreadyLinkedTargetsAreExcludedDespiteCaseAndPath() throws IOException {
        // insulin already links Glucagon (capitalized) — it must not be re-suggested even though PPR
        // reaches it through pancreas.
        writeNote(
                "wiki/concepts/insulin.md",
                "---\nkeywords:\n  - pancreas\n---\n# Insulin\n\nSee [[Glucagon]].\n");
        writeNote("wiki/concepts/pancreas.md", "# Pancreas\n\nSee [[glucagon]].\n");
        writeNote("wiki/concepts/glucagon.md", "# Glucagon\n\nA hormone.\n");

        List<DiscoveredLink> results = service.discover("wiki/concepts/insulin.md", NOOP);

        assertThat(results).extracting(DiscoveredLink::path).contains("wiki/concepts/pancreas.md");
        assertThat(results)
                .extracting(DiscoveredLink::path)
                .doesNotContain("wiki/concepts/glucagon.md");
    }

    @Test
    void emptySeedSetReturnsNoResults() throws IOException {
        // Source shares no tokens/substrings with any other note -> no seeds -> empty results.
        writeNote(
                "wiki/concepts/aaa.md",
                "---\nkeywords:\n  - qqzzxx\n---\n# Aaa\n\nUnrelated content.\n");
        writeNote("wiki/concepts/pancreas.md", "# Pancreas\n\nSee [[glucagon]].\n");
        writeNote("wiki/concepts/glucagon.md", "# Glucagon\n\nA hormone.\n");

        List<DiscoveredLink> results = service.discover("wiki/concepts/aaa.md", NOOP);

        assertThat(results).isEmpty();
    }

    @Test
    void substringScanSeedsWhenNoTokenOverlap() throws IOException {
        // "hyperglycemia" keyword has no whole-token match, but appears as a substring inside another
        // note's body, so the substring stage still seeds it.
        writeNote(
                "wiki/concepts/diabetes.md",
                "---\nkeywords:\n  - hyperglycemia\n---\n# Diabetes\n\nBody.\n");
        writeNote(
                "wiki/concepts/notes.md",
                "# Clinical notes\n\nChronic hyperglycemia is a marker.\n");

        List<DiscoveredLink> results = service.discover("wiki/concepts/diabetes.md", NOOP);

        assertThat(results).extracting(DiscoveredLink::path).contains("wiki/concepts/notes.md");
    }
}
