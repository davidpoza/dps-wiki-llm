package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.dto.ConceptDedupGroup;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.DocumentIndexRepository.SimilarPair;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ConceptDedupScanServiceTests {

    private DocumentIndexRepository repository;
    private AppSettingRepository settingRepository;
    private LlmClient llmClient;
    private PromptService promptService;
    private ConceptDedupScanService service;

    @BeforeEach
    void setUp() {
        repository = mock(DocumentIndexRepository.class);
        settingRepository = mock(AppSettingRepository.class);
        llmClient = mock(LlmClient.class);
        promptService = mock(PromptService.class);

        when(promptService.getText("concept-dedup-judge-system")).thenReturn("You are a judge.");
        when(settingRepository.findById("concept.dedup-similarity-threshold"))
                .thenReturn(Optional.empty());
        when(repository.findEmbeddedPathsByDocType(anyString(), anyString())).thenReturn(Set.of());

        AppProperties props =
                new AppProperties(
                        "/vault",
                        List.of(),
                        new AppProperties.Embeddings(
                                "http://embeddings:8080",
                                "test-model",
                                "",
                                2,
                                Duration.ofSeconds(1),
                                1),
                        new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                        null,
                        null,
                        null,
                        null,
                        null);

        service =
                new ConceptDedupScanService(
                        repository,
                        settingRepository,
                        props,
                        llmClient,
                        promptService,
                        new ObjectMapper());
    }

    @Test
    void givenNoPairs_returnsEmptyGroups() {
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of());
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(List.of());

        List<ConceptDedupGroup> result = service.scan(progress -> {});
        assertThat(result).isEmpty();
        verify(llmClient, never()).chatJson(any());
    }

    @Test
    void givenPairAboveThreshold_judgeConfirmsAndReturnsGroup() {
        DocumentRecord docA = doc("wiki/concepts/machine-learning.md", "machine learning content");
        DocumentRecord docB = doc("wiki/concepts/aprendizaje-automatico.md", "aprendizaje content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(
                        List.of(
                                new SimilarPair(
                                        "wiki/concepts/machine-learning.md",
                                        "wiki/concepts/aprendizaje-automatico.md",
                                        0.91)));
        when(llmClient.chatJson(any()))
                .thenReturn(
                        "{\"isSameConceptGroup\":true,\"canonicalFilename\":\"machine-learning\"}");

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).hasSize(1);
        assertThat(result.get(0).canonicalFilename()).isEqualTo("machine-learning");
        assertThat(result.get(0).files())
                .containsExactlyInAnyOrder("machine-learning", "aprendizaje-automatico");
    }

    @Test
    void givenPairAboveThreshold_judgeRejectsAndReturnsEmpty() {
        DocumentRecord docA = doc("wiki/concepts/consistency.md", "consistency content");
        DocumentRecord docB = doc("wiki/concepts/idempotency.md", "idempotency content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(
                        List.of(
                                new SimilarPair(
                                        "wiki/concepts/consistency.md",
                                        "wiki/concepts/idempotency.md",
                                        0.89)));
        when(llmClient.chatJson(any()))
                .thenReturn("{\"isSameConceptGroup\":false,\"canonicalFilename\":null}");

        List<ConceptDedupGroup> result = service.scan(progress -> {});
        assertThat(result).isEmpty();
    }

    @Test
    void givenTransitivePair_groupsThreeConcepts() {
        DocumentRecord docA = doc("wiki/concepts/ml.md", "ml content");
        DocumentRecord docB = doc("wiki/concepts/machine-learning.md", "machine learning");
        DocumentRecord docC = doc("wiki/concepts/aprendizaje-automatico.md", "aprendizaje");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB, docC));
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(
                        List.of(
                                new SimilarPair(
                                        "wiki/concepts/ml.md",
                                        "wiki/concepts/machine-learning.md",
                                        0.95),
                                new SimilarPair(
                                        "wiki/concepts/machine-learning.md",
                                        "wiki/concepts/aprendizaje-automatico.md",
                                        0.90)));
        when(llmClient.chatJson(any()))
                .thenReturn(
                        "{\"isSameConceptGroup\":true,\"canonicalFilename\":\"machine-learning\"}");

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).hasSize(1);
        assertThat(result.get(0).files()).hasSize(3);
        assertThat(result.get(0).canonicalFilename()).isEqualTo("machine-learning");
    }

    @Test
    void givenLlmTimeout_groupSkipped() {
        DocumentRecord docA = doc("wiki/concepts/machine-learning.md", "content");
        DocumentRecord docB = doc("wiki/concepts/ml.md", "content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(
                        List.of(
                                new SimilarPair(
                                        "wiki/concepts/machine-learning.md",
                                        "wiki/concepts/ml.md",
                                        0.93)));
        when(llmClient.chatJson(any())).thenThrow(new RuntimeException("timeout"));

        List<ConceptDedupGroup> result = service.scan(progress -> {});
        assertThat(result).isEmpty();
    }

    @Test
    void givenConceptWithNoEmbedding_warningProgressEmitted() {
        DocumentRecord docA = doc("wiki/concepts/machine-learning.md", "content");
        DocumentRecord docB = doc("wiki/concepts/orphan.md", "no embedding");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(repository.findEmbeddedPathsByDocType(anyString(), anyString()))
                .thenReturn(Set.of("wiki/concepts/machine-learning.md"));
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(List.of());

        List<String> warnings = new ArrayList<>();
        service.scan(
                progress -> {
                    if ("concept-dedup-warning".equals(progress.step()))
                        warnings.add(progress.message());
                });

        assertThat(warnings).containsExactly("wiki/concepts/orphan.md");
    }

    @Test
    void givenConceptWithEmbeddingButNoPair_emitsScanNotWarning() {
        DocumentRecord docA = doc("wiki/concepts/unique-topic.md", "very unique content");
        DocumentRecord docB = doc("wiki/concepts/something-else.md", "unrelated content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(repository.findEmbeddedPathsByDocType(anyString(), anyString()))
                .thenReturn(
                        Set.of("wiki/concepts/unique-topic.md", "wiki/concepts/something-else.md"));
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(List.of());

        List<String> warnings = new ArrayList<>();
        List<String> scanned = new ArrayList<>();
        service.scan(
                progress -> {
                    if ("concept-dedup-warning".equals(progress.step()))
                        warnings.add(progress.message());
                    else if ("concept-dedup-scan".equals(progress.step()))
                        scanned.add(progress.message());
                });

        assertThat(warnings).isEmpty();
        assertThat(scanned)
                .containsExactlyInAnyOrder(
                        "wiki/concepts/unique-topic.md", "wiki/concepts/something-else.md");
    }

    @Test
    void canonicalFilenameNormalization_stripsInvalidChars() {
        DocumentRecord docA = doc("wiki/concepts/machine-learning.md", "content");
        DocumentRecord docB = doc("wiki/concepts/ml.md", "content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(repository.findSimilarPairsByDocType(anyString(), anyString(), anyDouble()))
                .thenReturn(
                        List.of(
                                new SimilarPair(
                                        "wiki/concepts/machine-learning.md",
                                        "wiki/concepts/ml.md",
                                        0.95)));
        when(llmClient.chatJson(any()))
                .thenReturn(
                        "{\"isSameConceptGroup\":true,\"canonicalFilename\":\"Machine Learning!\"}");

        List<ConceptDedupGroup> result = service.scan(progress -> {});
        assertThat(result).hasSize(1);
        assertThat(result.get(0).canonicalFilename()).isEqualTo("machine-learning");
    }

    private DocumentRecord doc(String path, String body) {
        return new DocumentRecord(UUID.randomUUID(), path, path, "concept", Instant.now(), body);
    }
}
