package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MutationApplierTests {
    @TempDir
    Path vault;

    @Test
    void duplicateIdempotencyKeyIsSkipped() throws Exception {
        MutationApplier applier = applier();
        MutationPlan plan = new MutationPlan("plan-1", List.of(new MutationAction(
                MutationActionType.create,
                "wiki/concepts/demo.md",
                "Demo",
                Map.of("type", "concept"),
                Map.of("Facts", List.of("Fact one")),
                "key-1")));

        applier.apply(plan);
        var second = applier.apply(plan);

        assertThat(second.idempotentHits()).containsExactly("key-1");
        assertThat(Files.readString(vault.resolve("wiki/concepts/demo.md")).split("Fact one", -1)).hasSize(2);
    }

    @Test
    void createUnderTopicsIsRejected() {
        MutationPlan plan = new MutationPlan("plan-1", List.of(new MutationAction(
                MutationActionType.create,
                "wiki/topics/generated.md",
                "Generated",
                Map.of("type", "topic"),
                Map.of("Summary", List.of("Should not be created")),
                "topic-key")));

        assertThatThrownBy(() -> applier().apply(plan))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("auto-create topic");
    }

    private MutationApplier applier() {
        AppProperties properties = new AppProperties(
                vault.toString(),
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null, null);
        return new MutationApplier(new VaultPathResolver(properties), new MarkdownService(), new ObjectMapper());
    }
}
