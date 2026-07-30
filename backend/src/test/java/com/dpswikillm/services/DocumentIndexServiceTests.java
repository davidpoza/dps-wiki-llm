package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

class DocumentIndexServiceTests {

    @TempDir Path vault;

    @Test
    void indexFileUpsertsRecordWithDerivedTitleTypeAndBody() throws Exception {
        Files.createDirectories(vault.resolve("wiki/notes"));
        Files.writeString(
                vault.resolve("wiki/notes/my-note.md"), "# My Note\n\nSearchable body text.\n");
        DocumentIndexRepository repository = mock(DocumentIndexRepository.class);

        service(repository).indexFile("wiki/notes/my-note.md");

        ArgumentCaptor<DocumentRecord> captor = ArgumentCaptor.forClass(DocumentRecord.class);
        verify(repository).upsertDocument(captor.capture());
        DocumentRecord record = captor.getValue();
        assertThat(record.path()).isEqualTo("wiki/notes/my-note.md");
        assertThat(record.title()).isEqualTo("My Note");
        assertThat(record.docType()).isEqualTo("note");
        assertThat(record.body()).contains("Searchable body text.");
    }

    @Test
    void indexFileUsesFrontmatterTypeWhenPresent() throws Exception {
        Files.createDirectories(vault.resolve("wiki/topics"));
        Files.writeString(
                vault.resolve("wiki/topics/x.md"), "---\ntype: topic\n---\n# X\n\nBody.\n");
        DocumentIndexRepository repository = mock(DocumentIndexRepository.class);

        service(repository).indexFile("wiki/topics/x.md");

        ArgumentCaptor<DocumentRecord> captor = ArgumentCaptor.forClass(DocumentRecord.class);
        verify(repository).upsertDocument(captor.capture());
        assertThat(captor.getValue().docType()).isEqualTo("topic");
    }

    @Test
    void indexFileSkipsNonWikiPaths() throws Exception {
        Files.createDirectories(vault.resolve("resources"));
        Files.writeString(vault.resolve("resources/x.md"), "# X\n");
        DocumentIndexRepository repository = mock(DocumentIndexRepository.class);

        service(repository).indexFile("resources/x.md");

        verify(repository, never()).upsertDocument(any());
    }

    @Test
    void indexFileSkipsNonMarkdownPaths() throws Exception {
        Files.createDirectories(vault.resolve("wiki"));
        Files.writeString(vault.resolve("wiki/note.txt"), "text");
        DocumentIndexRepository repository = mock(DocumentIndexRepository.class);

        service(repository).indexFile("wiki/note.txt");

        verify(repository, never()).upsertDocument(any());
    }

    @Test
    void indexFileSkipsMissingFiles() {
        DocumentIndexRepository repository = mock(DocumentIndexRepository.class);

        service(repository).indexFile("wiki/missing.md");

        verify(repository, never()).upsertDocument(any());
    }

    @Test
    void removeFromIndexDeletesByNormalizedPath() {
        DocumentIndexRepository repository = mock(DocumentIndexRepository.class);

        service(repository).removeFromIndex("wiki/notes/gone.md");

        verify(repository).deleteDocument("wiki/notes/gone.md");
    }

    private DocumentIndexService service(DocumentIndexRepository repository) {
        return new DocumentIndexService(resolver(), new MarkdownService(), repository);
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(
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
                        null));
    }
}
