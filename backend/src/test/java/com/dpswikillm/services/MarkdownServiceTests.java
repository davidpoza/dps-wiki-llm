package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MarkdownServiceTests {
    private final MarkdownService markdownService = new MarkdownService();

    @Test
    void mergeIsIdempotentForRepeatedSectionItems() {
        String first = markdownService.mergeAndRender("", "Demo", Map.of("type", "concept"),
                Map.of("Facts", List.of("Fact one")));

        String second = markdownService.mergeAndRender(first, "Demo", Map.of("type", "concept"),
                Map.of("Facts", List.of("Fact one")));

        assertThat(second).contains("## Facts\n- Fact one");
        assertThat(second.split("Fact one", -1)).hasSize(2);
    }
}
