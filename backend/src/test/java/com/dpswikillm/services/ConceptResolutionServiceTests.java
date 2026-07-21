package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.AppSetting;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.AppSettingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ConceptResolutionServiceTests {

    @TempDir
    Path vault;

    private SemanticSearchService semanticSearch;
    private LlmClient llmClient;
    private PromptService promptService;
    private AppSettingRepository settingRepository;
    private ConceptResolutionService service;

    @BeforeEach
    void setUp() {
        semanticSearch = mock(SemanticSearchService.class);
        llmClient = mock(LlmClient.class);
        promptService = mock(PromptService.class);
        settingRepository = mock(AppSettingRepository.class);

        when(promptService.getText("concept-judge-system")).thenReturn("You are a judge.");
        when(settingRepository.findById("concept.similarity-threshold")).thenReturn(Optional.empty());

        AppProperties props = new AppProperties(vault.toString(), List.of(),
                new AppProperties.Embeddings("http://embeddings:8080", "test", "", 2, Duration.ofSeconds(1), 1),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null, null);
        service = new ConceptResolutionService(
                semanticSearch, llmClient, promptService,
                new MarkdownService(), new VaultPathResolver(props),
                settingRepository, new ObjectMapper());
    }

    @Test
    void synonymDetected_createRewrittenToUpdate() {
        MutationAction action = new MutationAction(MutationActionType.create, "wiki/concepts/ml.md",
                "ML", Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")), "key-ml");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        SearchResult existing = new SearchResult("wiki/concepts/machine-learning.md", "Machine Learning", "concept", 0.93, "A field of AI.");
        when(semanticSearch.searchByType(eq("ml"), eq("concept"), anyInt())).thenReturn(List.of(existing));
        when(llmClient.chatJson(any())).thenReturn("{\"match\": \"wiki/concepts/machine-learning.md\"}");

        MutationPlan resolved = service.resolve(plan);

        assertThat(resolved.pageActions()).hasSize(1);
        MutationAction result = resolved.pageActions().getFirst();
        assertThat(result.action()).isEqualTo(MutationActionType.update);
        assertThat(result.path()).isEqualTo("wiki/concepts/machine-learning.md");
    }

    @Test
    void noSimilarConcepts_createKept() {
        MutationAction action = new MutationAction(MutationActionType.create, "wiki/concepts/vector-clock.md",
                "Vector Clock", Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")), "key-vc");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        when(semanticSearch.searchByType(anyString(), anyString(), anyInt())).thenReturn(List.of());

        MutationPlan resolved = service.resolve(plan);

        assertThat(resolved.pageActions().getFirst().action()).isEqualTo(MutationActionType.create);
        assertThat(resolved.pageActions().getFirst().path()).isEqualTo("wiki/concepts/vector-clock.md");
        verify(llmClient, never()).chatJson(any());
    }

    @Test
    void judgeSaysNoMatch_createKept() {
        MutationAction action = new MutationAction(MutationActionType.create, "wiki/concepts/consistency.md",
                "Consistency", Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")), "key-c");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        SearchResult nearby = new SearchResult("wiki/concepts/idempotency.md", "Idempotency", "concept", 0.84, "Property of operations.");
        when(semanticSearch.searchByType(anyString(), anyString(), anyInt())).thenReturn(List.of(nearby));
        when(llmClient.chatJson(any())).thenReturn("{\"match\": null}");

        MutationPlan resolved = service.resolve(plan);

        assertThat(resolved.pageActions().getFirst().action()).isEqualTo(MutationActionType.create);
    }

    @Test
    void judgeTimeout_createKeptAsOpenFallback() throws Exception {
        MutationAction action = new MutationAction(MutationActionType.create, "wiki/concepts/idempotency.md",
                "Idempotency", Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")), "key-i");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        SearchResult nearby = new SearchResult("wiki/concepts/immutability.md", "Immutability", "concept", 0.85, "Immutable data.");
        when(semanticSearch.searchByType(anyString(), anyString(), anyInt())).thenReturn(List.of(nearby));
        when(llmClient.chatJson(any())).thenAnswer(inv -> {
            Thread.sleep(7_000);
            return "{\"match\": \"wiki/concepts/immutability.md\"}";
        });

        MutationPlan resolved = service.resolve(plan);

        assertThat(resolved.pageActions().getFirst().action()).isEqualTo(MutationActionType.create);
    }

    @Test
    void aliasAddedToExistingConcept() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(vault.resolve("wiki/concepts/machine-learning.md"), """
                ---
                type: concept
                title: Machine Learning
                ---

                # Machine Learning

                ## Summary
                A field of AI.
                """, StandardCharsets.UTF_8);

        MutationAction action = new MutationAction(MutationActionType.create, "wiki/concepts/ml.md",
                "ML", Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")), "key-ml2");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        SearchResult existing = new SearchResult("wiki/concepts/machine-learning.md", "Machine Learning", "concept", 0.95, "A field of AI.");
        when(semanticSearch.searchByType(anyString(), anyString(), anyInt())).thenReturn(List.of(existing));
        when(llmClient.chatJson(any())).thenReturn("{\"match\": \"wiki/concepts/machine-learning.md\"}");

        MutationPlan resolved = service.resolve(plan);

        MutationAction result = resolved.pageActions().getFirst();
        assertThat(result.frontmatter()).containsKey("aliases");
        @SuppressWarnings("unchecked")
        List<String> aliases = (List<String>) result.frontmatter().get("aliases");
        assertThat(aliases).contains("ml");
    }

    @Test
    void aliasNotDuplicated_whenAlreadyPresent() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(vault.resolve("wiki/concepts/machine-learning.md"), """
                ---
                type: concept
                title: Machine Learning
                aliases:
                  - ml
                ---

                # Machine Learning
                """, StandardCharsets.UTF_8);

        MutationAction action = new MutationAction(MutationActionType.create, "wiki/concepts/ml.md",
                "ML", Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")), "key-ml3");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        SearchResult existing = new SearchResult("wiki/concepts/machine-learning.md", "Machine Learning", "concept", 0.95, "A field of AI.");
        when(semanticSearch.searchByType(anyString(), anyString(), anyInt())).thenReturn(List.of(existing));
        when(llmClient.chatJson(any())).thenReturn("{\"match\": \"wiki/concepts/machine-learning.md\"}");

        MutationPlan resolved = service.resolve(plan);

        // When alias already exists in the target file, we don't include it in the frontmatter
        // update — mergeAndRender will preserve the existing aliases from the file unchanged.
        assertThat(resolved.pageActions().getFirst().frontmatter()).doesNotContainKey("aliases");
        assertThat(resolved.pageActions().getFirst().action()).isEqualTo(MutationActionType.update);
    }

    @Test
    void customThresholdRespected_belowThresholdNotConvoked() {
        when(settingRepository.findById("concept.similarity-threshold"))
                .thenReturn(Optional.of(new AppSetting("concept.similarity-threshold", "0.90")));

        AppProperties props = new AppProperties(vault.toString(), List.of(),
                new AppProperties.Embeddings("http://embeddings:8080", "test", "", 2, Duration.ofSeconds(1), 1),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null, null);
        ConceptResolutionService highThresholdService = new ConceptResolutionService(
                semanticSearch, llmClient, promptService,
                new MarkdownService(), new VaultPathResolver(props),
                settingRepository, new ObjectMapper());

        MutationAction action = new MutationAction(MutationActionType.create, "wiki/concepts/ml.md",
                "ML", Map.of("type", "concept"),
                Map.of("Sources", List.of("[[wiki/sources/source.md]]")), "key-ml4");
        MutationPlan plan = new MutationPlan("p1", List.of(action));

        SearchResult nearby = new SearchResult("wiki/concepts/machine-learning.md", "Machine Learning", "concept", 0.87, "AI field.");
        when(semanticSearch.searchByType(anyString(), anyString(), anyInt())).thenReturn(List.of(nearby));

        MutationPlan resolved = highThresholdService.resolve(plan);

        assertThat(resolved.pageActions().getFirst().action()).isEqualTo(MutationActionType.create);
        verify(llmClient, never()).chatJson(any());
    }
}
