package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.dto.ConceptDedupGroup;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ConceptDedupScanServiceTests {

    private DocumentIndexRepository repository;
    private LlmClient llmClient;
    private PromptService promptService;
    private ConceptDedupScanService service;

    @BeforeEach
    void setUp() {
        repository = mock(DocumentIndexRepository.class);
        llmClient = mock(LlmClient.class);
        promptService = mock(PromptService.class);

        when(promptService.getText("concept-batch-dedup-system"))
                .thenReturn("You are a dedup expert.");
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
                        repository, props, llmClient, promptService, new ObjectMapper());
    }

    @Test
    void givenNoConcepts_returnsEmptyWithoutCallingLlm() {
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of());

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).isEmpty();
        verify(llmClient, never()).chatJson(any());
    }

    @Test
    void givenBatchResponseWithGroup_returnsGroup() {
        DocumentRecord docA = doc("wiki/concepts/deep-work.md", "Deep Work");
        DocumentRecord docB = doc("wiki/concepts/trabajo-profundo.md", "Trabajo Profundo");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(llmClient.chatJson(any()))
                .thenReturn(
                        "[{\"canonical\":\"deep-work\",\"files\":[\"deep-work\",\"trabajo-profundo\"]}]");

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).hasSize(1);
        assertThat(result.get(0).canonicalFilename()).isEqualTo("deep-work");
        assertThat(result.get(0).files())
                .containsExactlyInAnyOrder("deep-work", "trabajo-profundo");
    }

    @Test
    void givenBatchResponseWithNoGroups_returnsEmpty() {
        DocumentRecord docA = doc("wiki/concepts/consistency.md", "Consistency");
        DocumentRecord docB = doc("wiki/concepts/idempotency.md", "Idempotency");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(llmClient.chatJson(any())).thenReturn("[]");

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).isEmpty();
    }

    @Test
    void givenBatchResponseGroupsThreeConcepts_returnsOneGroup() {
        DocumentRecord docA = doc("wiki/concepts/ml.md", "ML");
        DocumentRecord docB = doc("wiki/concepts/machine-learning.md", "Machine Learning");
        DocumentRecord docC =
                doc("wiki/concepts/aprendizaje-automatico.md", "Aprendizaje Automático");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB, docC));
        when(llmClient.chatJson(any()))
                .thenReturn(
                        "[{\"canonical\":\"machine-learning\","
                                + "\"files\":[\"ml\",\"machine-learning\",\"aprendizaje-automatico\"]}]");

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).hasSize(1);
        assertThat(result.get(0).canonicalFilename()).isEqualTo("machine-learning");
        assertThat(result.get(0).files()).hasSize(3);
    }

    @Test
    void givenBatchResponseWithInvalidSlug_slugFilteredOut() {
        DocumentRecord docA = doc("wiki/concepts/deep-work.md", "Deep Work");
        DocumentRecord docB = doc("wiki/concepts/trabajo-profundo.md", "Trabajo Profundo");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        // LLM hallucinates a slug that doesn't exist in the vault
        when(llmClient.chatJson(any()))
                .thenReturn(
                        "[{\"canonical\":\"deep-work\","
                                + "\"files\":[\"deep-work\",\"trabajo-profundo\",\"nonexistent-concept\"]}]");

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).hasSize(1);
        assertThat(result.get(0).files())
                .containsExactlyInAnyOrder("deep-work", "trabajo-profundo");
    }

    @Test
    void givenLlmError_returnsEmpty() {
        DocumentRecord docA = doc("wiki/concepts/machine-learning.md", "content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docA));
        when(llmClient.chatJson(any())).thenThrow(new RuntimeException("connection error"));

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).isEmpty();
    }

    @Test
    void givenMalformedJson_returnsEmpty() {
        DocumentRecord docA = doc("wiki/concepts/ml.md", "content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA));
        when(llmClient.chatJson(any())).thenReturn("not json at all");

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
        when(llmClient.chatJson(any())).thenReturn("[]");

        List<String> warnings = new ArrayList<>();
        service.scan(
                progress -> {
                    if ("concept-dedup-warning".equals(progress.step()))
                        warnings.add(progress.message());
                });

        assertThat(warnings).containsExactly("wiki/concepts/orphan.md");
    }

    @Test
    void givenConceptWithEmbeddingButUnique_emitsScanNotWarning() {
        DocumentRecord docA = doc("wiki/concepts/unique-topic.md", "very unique content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA));
        when(repository.findEmbeddedPathsByDocType(anyString(), anyString()))
                .thenReturn(Set.of("wiki/concepts/unique-topic.md"));
        when(llmClient.chatJson(any())).thenReturn("[]");

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
        assertThat(scanned).containsExactly("wiki/concepts/unique-topic.md");
    }

    @Test
    void canonicalNormalization_stripsInvalidChars() {
        DocumentRecord docA = doc("wiki/concepts/machine-learning.md", "content");
        DocumentRecord docB = doc("wiki/concepts/ml.md", "content");
        when(repository.findDocumentsByDocType("concept")).thenReturn(List.of(docA, docB));
        when(llmClient.chatJson(any()))
                .thenReturn(
                        "[{\"canonical\":\"Machine Learning!\","
                                + "\"files\":[\"machine-learning\",\"ml\"]}]");

        List<ConceptDedupGroup> result = service.scan(progress -> {});

        assertThat(result).hasSize(1);
        // "Machine Learning!" normalized → "machine-learning"
        assertThat(result.get(0).canonicalFilename()).isEqualTo("machine-learning");
    }

    private DocumentRecord doc(String path, String title) {
        return new DocumentRecord(UUID.randomUUID(), path, title, "concept", Instant.now(), title);
    }
}
