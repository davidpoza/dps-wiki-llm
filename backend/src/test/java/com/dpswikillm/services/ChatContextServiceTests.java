package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dpswikillm.domain.ContextSource;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ChatContextSettingsDto;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.services.ChatContextService.ContextPacket;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ChatContextServiceTests {

    private EmbeddingClient embeddingClient;
    private DocumentIndexRepository repository;
    private WikiLinkResolver linkResolver;
    private ChatContextService service;

    @BeforeEach
    void setUp() {
        embeddingClient = mock(EmbeddingClient.class);
        repository = mock(DocumentIndexRepository.class);
        linkResolver = mock(WikiLinkResolver.class);
        service = new ChatContextService(embeddingClient, repository, linkResolver);
        when(embeddingClient.embedQuery(any())).thenReturn(new float[] {1f, 0f});
    }

    private static SearchResult hit(String path, double score, String body) {
        return new SearchResult(path, path, "concept", score, body);
    }

    private static ChatContextSettingsDto settings(
            boolean expansion, int maxDepth, int maxLinked, int budget) {
        return new ChatContextSettingsDto(5, expansion, maxDepth, maxLinked, budget);
    }

    @Test
    void expansionDisabledUsesOnlyDirectHits() throws Exception {
        when(repository.semanticSearch(any(), anyInt()))
                .thenReturn(List.of(hit("wiki/a.md", 0.9, "AAAA"), hit("wiki/b.md", 0.8, "BBBB")));

        ContextPacket packet = service.build("q", settings(false, 1, 5, 6_000));

        assertThat(packet.sources())
                .extracting(ContextSource::path)
                .containsExactly("wiki/a.md", "wiki/b.md");
        assertThat(packet.sources())
                .allMatch(s -> s.provenance() == ContextSource.Provenance.DIRECT);
        assertThat(packet.contextText()).contains("### wiki/a.md").contains("### wiki/b.md");
        verifyNoInteractions(linkResolver);
    }

    @Test
    void depthOneIncludesLinkedNote() throws Exception {
        when(repository.semanticSearch(any(), anyInt()))
                .thenReturn(List.of(hit("wiki/a.md", 0.9, "links to [[b]]")));
        when(linkResolver.collectMarkdownFiles()).thenReturn(List.of());
        when(linkResolver.buildSlugIndex(any())).thenReturn(Map.of());
        when(linkResolver.extractLinkedTargets(eq("links to [[b]]"), any()))
                .thenReturn(Set.of("wiki/b.md"));
        when(repository.scorePathsAgainstQuery(any(), eq(List.of("wiki/b.md"))))
                .thenReturn(List.of(hit("wiki/b.md", 0.7, "BODY B")));

        ContextPacket packet = service.build("q", settings(true, 1, 5, 6_000));

        assertThat(packet.sources()).extracting(ContextSource::path)
                .containsExactly("wiki/a.md", "wiki/b.md");
        ContextSource linked = packet.sources().get(1);
        assertThat(linked.provenance()).isEqualTo(ContextSource.Provenance.LINKED);
        assertThat(linked.depth()).isEqualTo(1);
        assertThat(packet.contextText()).contains("### wiki/b.md").contains("BODY B");
    }

    @Test
    void directHitsAndDuplicateLinksAreExcludedFromCandidates() throws Exception {
        when(repository.semanticSearch(any(), anyInt()))
                .thenReturn(
                        List.of(
                                hit("wiki/a.md", 0.9, "A body [[b]] [[c]]"),
                                hit("wiki/b.md", 0.8, "B body [[c]]")));
        when(linkResolver.collectMarkdownFiles()).thenReturn(List.of());
        when(linkResolver.buildSlugIndex(any())).thenReturn(Map.of());
        when(linkResolver.extractLinkedTargets(eq("A body [[b]] [[c]]"), any()))
                .thenReturn(Set.of("wiki/b.md", "wiki/c.md"));
        when(linkResolver.extractLinkedTargets(eq("B body [[c]]"), any()))
                .thenReturn(Set.of("wiki/c.md"));
        // Only wiki/c.md is a genuine new candidate (b.md is a direct hit).
        when(repository.scorePathsAgainstQuery(any(), eq(List.of("wiki/c.md"))))
                .thenReturn(List.of(hit("wiki/c.md", 0.6, "C body")));

        ContextPacket packet = service.build("q", settings(true, 1, 5, 6_000));

        assertThat(packet.sources()).extracting(ContextSource::path)
                .containsExactly("wiki/a.md", "wiki/b.md", "wiki/c.md");
        assertThat(packet.sources().get(2).provenance()).isEqualTo(ContextSource.Provenance.LINKED);
    }

    @Test
    void budgetKeepsDirectHitsAndDropsLinked() throws Exception {
        when(repository.semanticSearch(any(), anyInt()))
                .thenReturn(List.of(hit("wiki/a.md", 0.9, "AAAA")));
        when(linkResolver.collectMarkdownFiles()).thenReturn(List.of());
        when(linkResolver.buildSlugIndex(any())).thenReturn(Map.of());
        when(linkResolver.extractLinkedTargets(any(), any())).thenReturn(Set.of("wiki/b.md"));
        when(repository.scorePathsAgainstQuery(any(), any()))
                .thenReturn(List.of(hit("wiki/b.md", 0.99, "BBBB")));

        // Budget large enough for the direct hit but not the linked note.
        ContextPacket packet = service.build("q", settings(true, 1, 5, 25));

        assertThat(packet.sources()).extracting(ContextSource::path).containsExactly("wiki/a.md");
        assertThat(packet.sources())
                .noneMatch(s -> s.provenance() == ContextSource.Provenance.LINKED);
        assertThat(packet.contextText().length()).isLessThanOrEqualTo(25);
    }

    @Test
    void maxLinkedNotesCapsIncludedLinks() throws Exception {
        when(repository.semanticSearch(any(), anyInt()))
                .thenReturn(List.of(hit("wiki/a.md", 0.9, "A body")));
        when(linkResolver.collectMarkdownFiles()).thenReturn(List.of());
        when(linkResolver.buildSlugIndex(any())).thenReturn(Map.of());
        when(linkResolver.extractLinkedTargets(any(), any()))
                .thenReturn(Set.of("wiki/c.md", "wiki/d.md", "wiki/e.md"));
        when(repository.scorePathsAgainstQuery(any(), any()))
                .thenReturn(
                        List.of(
                                hit("wiki/c.md", 0.9, "C"),
                                hit("wiki/d.md", 0.8, "D"),
                                hit("wiki/e.md", 0.7, "E")));

        ContextPacket packet = service.build("q", settings(true, 1, 1, 6_000));

        assertThat(packet.sources()).extracting(ContextSource::path)
                .containsExactly("wiki/a.md", "wiki/c.md");
        assertThat(packet.sources().stream()
                        .filter(s -> s.provenance() == ContextSource.Provenance.LINKED)
                        .count())
                .isEqualTo(1);
    }
}
