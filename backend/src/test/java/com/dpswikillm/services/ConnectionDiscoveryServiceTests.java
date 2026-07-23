package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.domain.ConnectionCandidateSource;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.domain.SourceKind;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ConnectionDiscoveryServiceTests {
    private static final String SOURCE_NOTE = "wiki/sources/fixture.md";

    private SemanticSearchService semanticSearch;
    private JobConnectionCandidateRepository candidateRepository;
    private ConnectionDiscoveryService service;

    @BeforeEach
    void setUp() {
        semanticSearch = mock(SemanticSearchService.class);
        candidateRepository = mock(JobConnectionCandidateRepository.class);
        when(candidateRepository.saveAll(any()))
                .thenAnswer(
                        invocation -> {
                            Collection<JobConnectionCandidate> saved = invocation.getArgument(0);
                            return new ArrayList<>(saved);
                        });
        JobLifecycleService lifecycle = mock(JobLifecycleService.class);
        service = new ConnectionDiscoveryService(semanticSearch, candidateRepository, lifecycle);
    }

    @Test
    void addsTopicCandidateWhenTopicAboveThreshold() {
        when(semanticSearch.search(anyString(), anyInt())).thenReturn(List.of());
        when(semanticSearch.searchByType(anyString(), eq("topic"), anyInt()))
                .thenReturn(
                        List.of(
                                new SearchResult(
                                        "wiki/topics/ai.md", "ai", "topic", 0.83, "body")));

        List<JobConnectionCandidate> result =
                service.discoverAndPersist(job(), payload(), SOURCE_NOTE, emptyPlan());

        assertThat(result)
                .anySatisfy(
                        candidate -> {
                            assertThat(candidate.getTargetPath()).isEqualTo("wiki/topics/ai.md");
                            assertThat(candidate.getSource())
                                    .isEqualTo(ConnectionCandidateSource.topic);
                        });
    }

    @Test
    void skipsTopicBelowThresholdAndEmptyIndex() {
        when(semanticSearch.search(anyString(), anyInt())).thenReturn(List.of());
        when(semanticSearch.searchByType(anyString(), eq("topic"), anyInt()))
                .thenReturn(
                        List.of(
                                new SearchResult(
                                        "wiki/topics/ai.md", "ai", "topic", 0.50, "body")));
        assertThat(service.discoverAndPersist(job(), payload(), SOURCE_NOTE, emptyPlan()))
                .isEmpty();

        when(semanticSearch.searchByType(anyString(), eq("topic"), anyInt())).thenReturn(List.of());
        assertThat(service.discoverAndPersist(job(), payload(), SOURCE_NOTE, emptyPlan()))
                .isEmpty();
    }

    @Test
    void doesNotDuplicateTopicAlreadyProposedBySemanticSearch() {
        when(semanticSearch.search(anyString(), anyInt()))
                .thenReturn(
                        List.of(
                                new SearchResult(
                                        "wiki/topics/ai.md", "ai", "topic", 0.90, "body")));
        when(semanticSearch.searchByType(anyString(), eq("topic"), anyInt()))
                .thenReturn(
                        List.of(
                                new SearchResult(
                                        "wiki/topics/ai.md", "ai", "topic", 0.83, "body")));

        List<JobConnectionCandidate> result =
                service.discoverAndPersist(job(), payload(), SOURCE_NOTE, emptyPlan());

        assertThat(result)
                .filteredOn(candidate -> candidate.getTargetPath().equals("wiki/topics/ai.md"))
                .hasSize(1);
        assertThat(result)
                .noneMatch(candidate -> candidate.getSource() == ConnectionCandidateSource.topic);
    }

    private Job job() {
        Job job = new Job();
        ReflectionTestUtils.setField(job, "id", UUID.randomUUID());
        return job;
    }

    private NormalizedSourcePayload payload() {
        return new NormalizedSourcePayload(
                "id",
                SourceKind.web,
                Instant.now(),
                "raw/inbox/input.md",
                "transformers",
                "content",
                null,
                "checksum",
                Map.of(),
                null);
    }

    private MutationPlan emptyPlan() {
        return new MutationPlan("empty", List.of());
    }
}
