package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MutationGuardrailServiceTests {

    @TempDir Path vault;

    private MutationGuardrailService guardrail() {
        AppProperties props =
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
                        null);
        return new MutationGuardrailService(new VaultPathResolver(props));
    }

    private MutationAction conceptAction(String path) {
        return new MutationAction(
                MutationActionType.create,
                path,
                "Title",
                Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")),
                "key-1");
    }

    @Test
    void pluralSlugIsNormalizedToSingular() {
        MutationPlan plan =
                new MutationPlan("p1", List.of(conceptAction("wiki/concepts/mental-models.md")));

        var result = guardrail().guardrail(plan, "raw/inbox/a.md", "wiki/sources/source.md");

        assertThat(result.rejections()).isEmpty();
        assertThat(result.plan().pageActions()).hasSize(1);
        assertThat(result.plan().pageActions().getFirst().path())
                .isEqualTo("wiki/concepts/mental-model.md");
        assertThat(result.plan().pageActions().getFirst().action())
                .isEqualTo(MutationActionType.create);
    }

    @Test
    void ambiguousPluralIsConvertedToNoop() {
        MutationPlan plan =
                new MutationPlan("p1", List.of(conceptAction("wiki/concepts/analyses.md")));

        var result = guardrail().guardrail(plan, "raw/inbox/a.md", "wiki/sources/source.md");

        assertThat(result.rejections()).hasSize(1);
        assertThat(result.rejections().getFirst()).contains("ambiguous plural");
        assertThat(result.plan().pageActions().getFirst().action())
                .isEqualTo(MutationActionType.noop);
    }

    @Test
    void correctSingularSlugPassesThrough() {
        MutationPlan plan =
                new MutationPlan("p1", List.of(conceptAction("wiki/concepts/mental-model.md")));

        var result = guardrail().guardrail(plan, "raw/inbox/a.md", "wiki/sources/source.md");

        assertThat(result.rejections()).isEmpty();
        assertThat(result.plan().pageActions().getFirst().path())
                .isEqualTo("wiki/concepts/mental-model.md");
        assertThat(result.plan().pageActions().getFirst().action())
                .isEqualTo(MutationActionType.create);
    }

    @Test
    void iesEndingNormalizedToY() {
        MutationPlan plan =
                new MutationPlan(
                        "p1", List.of(conceptAction("wiki/concepts/design-strategies.md")));

        var result = guardrail().guardrail(plan, "raw/inbox/a.md", "wiki/sources/source.md");

        assertThat(result.rejections()).isEmpty();
        assertThat(result.plan().pageActions().getFirst().path())
                .isEqualTo("wiki/concepts/design-strategy.md");
    }

    @Test
    void nonConceptPathNotAffectedBySlugNormalization() {
        MutationAction action =
                new MutationAction(
                        MutationActionType.create,
                        "wiki/analyses/2024-report.md",
                        "Report",
                        Map.of("type", "analysis"),
                        Map.of("Sources", List.of("[[wiki/sources/source.md]]")),
                        "key-a");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        var result = guardrail().guardrail(plan, "raw/inbox/a.md", "wiki/sources/source.md");

        assertThat(result.plan().pageActions().getFirst().path())
                .isEqualTo("wiki/analyses/2024-report.md");
    }
}
