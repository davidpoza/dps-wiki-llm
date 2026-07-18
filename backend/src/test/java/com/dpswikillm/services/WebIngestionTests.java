package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.SourceKind;
import com.dpswikillm.services.WebExtractorClient.ExtractionMetadata;
import com.dpswikillm.services.WebExtractorClient.ExtractionResult;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WebIngestionTests {
    @TempDir
    Path vault;

    private VaultPathResolver resolver() {
        return new VaultPathResolver(new AppProperties(vault.toString(), List.of("http://localhost:4200"),
                null, null, null, null, null, null, null));
    }

    private ExtractionResult sampleResult() {
        return new ExtractionResult(
                "## Heading\n\nBody paragraph with content.",
                new ExtractionMetadata(
                        "https://example.com/final",
                        "https://example.com/canonical",
                        "Sample Title",
                        "Ada Lovelace",
                        "2026-01-15",
                        "Example Site",
                        "es",
                        "high"));
    }

    @Test
    void ingestUrlWritesFrontmatterAndMarkdown() throws Exception {
        WebExtractorClient client = mock(WebExtractorClient.class);
        when(client.extract("https://example.com/article")).thenReturn(sampleResult());
        RawIntakeService intake = new RawIntakeService(resolver(), client);

        String rawPath = intake.ingestUrl("https://example.com/article");

        assertThat(rawPath).startsWith("raw/web/");
        String content = Files.readString(vault.resolve(rawPath), StandardCharsets.UTF_8);
        assertThat(content).startsWith("---\n");
        assertThat(content).contains("source_url: \"https://example.com/final\"");
        assertThat(content).contains("canonical_url: \"https://example.com/canonical\"");
        assertThat(content).contains("extraction_confidence: \"high\"");
        assertThat(content).contains("## Heading");
    }

    @Test
    void normalizerReadsFrontmatterTitleAndCanonicalUrl() throws Exception {
        WebExtractorClient client = mock(WebExtractorClient.class);
        when(client.extract("https://example.com/article")).thenReturn(sampleResult());
        RawIntakeService intake = new RawIntakeService(resolver(), client);
        String rawPath = intake.ingestUrl("https://example.com/article");

        NormalizedSourcePayload payload = new SourceNormalizer(resolver()).normalize(rawPath);

        assertThat(payload.sourceKind()).isEqualTo(SourceKind.web);
        assertThat(payload.title()).isEqualTo("Sample Title");
        assertThat(payload.canonicalUrl()).isEqualTo("https://example.com/canonical");
        assertThat(payload.metadata()).containsEntry("extraction_confidence", "high");
    }

    @Test
    void serviceUnavailablePropagates() {
        WebExtractorClient client = mock(WebExtractorClient.class);
        when(client.extract("https://example.com/down"))
                .thenThrow(new WebExtractionException("service_unavailable", "unreachable"));
        RawIntakeService intake = new RawIntakeService(resolver(), client);

        assertThatThrownBy(() -> intake.ingestUrl("https://example.com/down"))
                .isInstanceOf(WebExtractionException.class);
    }

    @Test
    void normalizerFallsBackToLegacySourceUrlLine() throws Exception {
        Files.createDirectories(vault.resolve("raw/web"));
        Path legacy = vault.resolve("raw/web/legacy.md");
        Files.writeString(legacy, "# Legacy Title\n\nSource URL: https://old.example.com/page\n\nBody text.");

        NormalizedSourcePayload payload = new SourceNormalizer(resolver()).normalize("raw/web/legacy.md");

        assertThat(payload.title()).isEqualTo("Legacy Title");
        assertThat(payload.canonicalUrl()).isEqualTo("https://old.example.com/page");
    }
}
