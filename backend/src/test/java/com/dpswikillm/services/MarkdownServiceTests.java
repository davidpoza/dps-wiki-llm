package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MarkdownServiceTests {
    private final MarkdownService markdownService = new MarkdownService();

    @Test
    void frontmatterIsIdempotentAcrossMultiplePasses() {
        String first =
                markdownService.mergeAndRender("", "Demo", Map.of("title", "Hello: World"), null);
        String second =
                markdownService.mergeAndRender(
                        first, "Demo", Map.of("title", "Hello: World"), null);
        String third =
                markdownService.mergeAndRender(
                        second, "Demo", Map.of("title", "Hello: World"), null);

        assertThat(second).isEqualTo(first);
        assertThat(third).isEqualTo(first);
    }

    @Test
    void mergeIsIdempotentForRepeatedSectionItems() {
        String first =
                markdownService.mergeAndRender(
                        "",
                        "Demo",
                        Map.of("type", "concept"),
                        Map.of("Facts", List.of("Fact one")));

        String second =
                markdownService.mergeAndRender(
                        first,
                        "Demo",
                        Map.of("type", "concept"),
                        Map.of("Facts", List.of("Fact one")));

        assertThat(second).contains("## Facts\n- Fact one");
        assertThat(second.split("Fact one", -1)).hasSize(2);
    }

    @Test
    void sectionReplacementOverwritesExistingLinks() {
        String existing = "# Note\n\n## Related\n- [[old.md]]\n- [[also-old.md]]\n";

        String result =
                markdownService.mergeAndRender(
                        existing, "Note", null, null, Map.of("Related", List.of("[[new.md]]")));

        assertThat(result).contains("## Related\n- [[new.md]]");
        assertThat(result).doesNotContain("old.md");
    }

    @Test
    void sectionReplacementLeavesManualLinksUntouched() {
        String existing =
                "# Note\n\n"
                        + "## Related\n- [[old.md]]\n\n"
                        + "## Manual Links\n- [[manual.md]]\n";

        String result =
                markdownService.mergeAndRender(
                        existing, "Note", null, null, Map.of("Related", List.of("[[new.md]]")));

        assertThat(result).contains("## Related\n- [[new.md]]");
        assertThat(result).doesNotContain("old.md");
        assertThat(result).contains("## Manual Links\n- [[manual.md]]");
    }

    @Test
    void injectFrontmatterListPreservesBodyAndAddsOnlyKeywords() {
        String original =
                "---\n"
                        + "type: \"concept\"\n"
                        + "updated: \"2026-06-01\"\n"
                        + "---\n\n"
                        + "# Economía del Software\n\n"
                        + "## Facts\n"
                        + "- La economía del software estudia costos y valor.\n\n"
                        + "## Related\n"
                        + "- [[productividad-de-ingenieria|Productividad de Ingeniería]]\n";

        String result =
                markdownService.injectFrontmatterList(
                        original, "keywords", List.of("economía", "software", "costos"));

        // Body (everything after the closing frontmatter delimiter) is unchanged.
        String body = original.substring(original.indexOf("\n---\n"));
        assertThat(result).endsWith(body);
        // Existing frontmatter fields are preserved.
        assertThat(result).contains("type: \"concept\"");
        assertThat(result).contains("updated: \"2026-06-01\"");
        // Keywords are added as a YAML list before the closing delimiter.
        assertThat(result)
                .contains("keywords:\n  - \"economía\"\n  - \"software\"\n  - \"costos\"\n---\n");
        // Re-parsing round-trips the keywords into the frontmatter map.
        assertThat(markdownService.parse(result).frontmatter().get("keywords"))
                .isEqualTo(List.of("economía", "software", "costos"));
    }

    @Test
    void injectFrontmatterListCreatesBlockWhenAbsent() {
        String original = "# Title\n\nSome body text.\n";

        String result =
                markdownService.injectFrontmatterList(original, "keywords", List.of("alpha"));

        assertThat(result).startsWith("---\nkeywords:\n  - \"alpha\"\n---\n\n");
        assertThat(result).endsWith(original);
    }
}
