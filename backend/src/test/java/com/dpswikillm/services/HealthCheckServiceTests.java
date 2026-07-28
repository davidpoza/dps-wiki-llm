package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.Snapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class HealthCheckServiceTests {

    @TempDir Path vault;

    private HealthCheckService service;
    private Snapshot snapshot;

    @BeforeEach
    void setUp() {
        AppProperties properties =
                new AppProperties(
                        vault.toString(),
                        List.of(),
                        new AppProperties.Embeddings(
                                "http://localhost", "model", "", 384, Duration.ofSeconds(1), 8),
                        new AppProperties.Llm("http://localhost", "model", "key"),
                        new AppProperties.Telegram("", ""),
                        null,
                        null,
                        null,
                        null);
        VaultPathResolver pathResolver = new VaultPathResolver(properties);
        MarkdownService markdownService = new MarkdownService();
        MutationApplier mutationApplier =
                new MutationApplier(pathResolver, markdownService, new ObjectMapper());

        SnapshotService snapshotService = mock(SnapshotService.class);
        try {
            doNothing().when(snapshotService).captureFile(any(), any());
        } catch (Exception ignored) {
        }

        service =
                new HealthCheckService(
                        mock(ReindexService.class),
                        mock(EmbeddingIndexService.class),
                        mock(SemanticSearchService.class),
                        markdownService,
                        mutationApplier,
                        snapshotService,
                        mock(com.dpswikillm.repositories.DocumentIndexRepository.class),
                        properties,
                        mock(com.dpswikillm.repositories.AppSettingRepository.class));

        snapshot = mock(Snapshot.class);
        when(snapshot.getId()).thenReturn(UUID.randomUUID());
    }

    /** Helper: write a minimal wiki note to the temp vault. */
    private void writeNote(String path, String relatedContent) throws Exception {
        Path file = vault.resolve(path);
        Files.createDirectories(file.getParent());
        StringBuilder sb = new StringBuilder();
        sb.append("# Note\n\n");
        if (relatedContent != null && !relatedContent.isBlank()) {
            sb.append("## Related\n").append(relatedContent).append("\n");
        }
        Files.writeString(file, sb.toString(), StandardCharsets.UTF_8);
    }

    private String readNote(String path) throws Exception {
        return Files.readString(vault.resolve(path), StandardCharsets.UTF_8);
    }

    // --- task 3.1 ---
    @Test
    void backlinkOnlyPathReceivesAppend_primaryPathReceivesReplace() throws Exception {
        writeNote("wiki/concepts/a.md", "- [[wiki/concepts/old.md]]");
        writeNote("wiki/concepts/b.md", "- [[wiki/concepts/other.md]]");

        Map<String, LinkedHashSet<String>> computed =
                Map.of(
                        "wiki/concepts/a.md",
                        linkedSet("[[wiki/concepts/b.md]]"),
                        "wiki/concepts/b.md",
                        linkedSet("[[wiki/concepts/a.md]]"));

        // A is primary (in selection), B is backlink-only
        service.applyConnections(computed, Set.of("wiki/concepts/b.md"), snapshot);

        String aContent = readNote("wiki/concepts/a.md");
        String bContent = readNote("wiki/concepts/b.md");

        // A is primary → old.md link is REPLACED, only b.md remains
        assertThat(aContent).contains("[[wiki/concepts/b.md]]");
        assertThat(aContent).doesNotContain("old.md");

        // B is backlink-only → other.md is PRESERVED, a.md link is APPENDED
        assertThat(bContent).contains("[[wiki/concepts/other.md]]");
        assertThat(bContent).contains("[[wiki/concepts/a.md]]");
    }

    // --- task 3.2 ---
    @Test
    void bothInSelection_bothRelatedSectionsAreFullyReplaced() throws Exception {
        writeNote("wiki/concepts/a.md", "- [[wiki/concepts/stale.md]]");
        writeNote("wiki/concepts/b.md", "- [[wiki/concepts/stale.md]]");

        Map<String, LinkedHashSet<String>> computed =
                Map.of(
                        "wiki/concepts/a.md",
                        linkedSet("[[wiki/concepts/b.md]]"),
                        "wiki/concepts/b.md",
                        linkedSet("[[wiki/concepts/a.md]]"));

        // Both A and B are in the selection → backlinkOnlyPaths is empty
        service.applyConnections(computed, Set.of(), snapshot);

        String aContent = readNote("wiki/concepts/a.md");
        String bContent = readNote("wiki/concepts/b.md");

        assertThat(aContent).contains("[[wiki/concepts/b.md]]");
        assertThat(aContent).doesNotContain("stale.md");

        assertThat(bContent).contains("[[wiki/concepts/a.md]]");
        assertThat(bContent).doesNotContain("stale.md");
    }

    // --- task 3.3 ---
    @Test
    void fullRun_emptyBacklinkOnlyPaths_allSectionsReplaced() throws Exception {
        writeNote("wiki/concepts/a.md", "- [[wiki/concepts/old.md]]");
        writeNote("wiki/concepts/b.md", "- [[wiki/concepts/old.md]]");

        Map<String, LinkedHashSet<String>> computed =
                Map.of(
                        "wiki/concepts/a.md",
                        linkedSet("[[wiki/concepts/b.md]]"),
                        "wiki/concepts/b.md",
                        linkedSet("[[wiki/concepts/a.md]]"));

        // Full run: no pathFilter → backlinkOnlyPaths is empty
        service.applyConnections(computed, Set.of(), snapshot);

        assertThat(readNote("wiki/concepts/a.md")).doesNotContain("old.md");
        assertThat(readNote("wiki/concepts/b.md")).doesNotContain("old.md");
    }

    // --- task 3.4 ---
    @Test
    void repeatedPartialRunDoesNotDuplicateBacklink() throws Exception {
        writeNote("wiki/concepts/a.md", null);
        writeNote("wiki/concepts/b.md", null);

        Map<String, LinkedHashSet<String>> computed =
                Map.of(
                        "wiki/concepts/a.md",
                        linkedSet("[[wiki/concepts/b.md]]"),
                        "wiki/concepts/b.md",
                        linkedSet("[[wiki/concepts/a.md]]"));
        Set<String> backlinkOnly = Set.of("wiki/concepts/b.md");

        // First run
        service.applyConnections(computed, backlinkOnly, snapshot);

        // Second run with a fresh snapshot (new idempotency key)
        Snapshot snapshot2 = mock(Snapshot.class);
        when(snapshot2.getId()).thenReturn(UUID.randomUUID());
        service.applyConnections(computed, backlinkOnly, snapshot2);

        String bContent = readNote("wiki/concepts/b.md");
        long occurrences =
                bContent.lines().filter(line -> line.contains("[[wiki/concepts/a.md]]")).count();
        assertThat(occurrences).isEqualTo(1);
    }

    private LinkedHashSet<String> linkedSet(String... items) {
        return new LinkedHashSet<>(List.of(items));
    }
}
