package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.DocumentIndexRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SemanticRetrievalServicesTests {
    @TempDir Path vault;

    @Test
    void reindexWalksWikiOnly() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.createDirectories(vault.resolve("raw/inbox"));
        Files.writeString(
                vault.resolve("wiki/concepts/demo.md"),
                """
                ---
                type: concept
                ---

                # Demo

                ## Summary
                Text.
                """);
        Files.writeString(vault.resolve("raw/inbox/source.md"), "# Raw\n");
        FakeRepository repository = new FakeRepository();

        List<DocumentRecord> documents =
                new ReindexService(resolver(), new MarkdownService(), repository).reindexWiki();

        assertThat(documents)
                .extracting(DocumentRecord::path)
                .containsExactly("wiki/concepts/demo.md");
        assertThat(repository.documents).hasSize(1);
    }

    @Test
    void embedIncrementalSkipsUnchangedAndPrunesDeleted() {
        FakeRepository repository = new FakeRepository();
        DocumentRecord doc = doc("wiki/concepts/a.md", "A", "alpha");
        repository.documents = new ArrayList<>(List.of(doc));
        StubEmbeddingClient embeddings = new StubEmbeddingClient();
        EmbeddingIndexService service =
                new EmbeddingIndexService(
                        repository,
                        embeddings,
                        properties(),
                        new MarkdownService(),
                        emptySettings());

        assertThat(service.embedIncremental().embeddedDocuments()).isEqualTo(1);
        assertThat(service.embedIncremental().embeddedDocuments()).isZero();

        repository.documents = new ArrayList<>();
        service.embedIncremental();
        assertThat(repository.embeddingHashes).isEmpty();
    }

    @Test
    void embedIncrementalComputesHubnessAndPrunesItWithEmbeddings() {
        FakeRepository repository = new FakeRepository();
        DocumentRecord a = doc("wiki/concepts/a.md", "A", "alpha");
        DocumentRecord b = doc("wiki/concepts/b.md", "B", "beta");
        repository.documents = new ArrayList<>(List.of(a, b));
        EmbeddingIndexService service =
                new EmbeddingIndexService(
                        repository,
                        new StubEmbeddingClient(),
                        properties(),
                        new MarkdownService(),
                        emptySettings());

        service.embedIncremental();
        assertThat(repository.hubness).containsKeys(a.id(), b.id());

        // Remove b from the vault: its embedding and its hubness are pruned together.
        repository.documents = new ArrayList<>(List.of(a));
        service.embedIncremental();
        assertThat(repository.hubness).containsKey(a.id()).doesNotContainKey(b.id());
    }

    @Test
    void semanticSearchReturnsNearestAndEmptyIndexReturnsEmpty() {
        FakeRepository repository = new FakeRepository();
        repository.documents =
                new ArrayList<>(
                        List.of(
                                doc("wiki/concepts/a.md", "A", "alpha"),
                                doc("wiki/concepts/b.md", "B", "beta")));
        repository.vectors.put(repository.documents.get(0).id(), new float[] {1, 0});
        repository.vectors.put(repository.documents.get(1).id(), new float[] {0, 1});

        SemanticSearchService service =
                new SemanticSearchService(new StubEmbeddingClient(), repository);

        assertThat(service.search("alpha", 2))
                .extracting(SearchResult::path)
                .containsExactly("wiki/concepts/a.md", "wiki/concepts/b.md");
        repository.vectors.clear();
        assertThat(service.search("alpha", 2)).isEmpty();
    }

    @Test
    void lexicalLookupMatchesTitlePathOrBody() {
        FakeRepository repository = new FakeRepository();
        repository.documents =
                new ArrayList<>(
                        List.of(
                                doc(
                                        "wiki/concepts/vector-search.md",
                                        "Vector Search",
                                        "semantic matching"),
                                doc("wiki/entities/other.md", "Other", "unrelated")));

        assertThat(new FileLookupService(repository).lookup("semantic", 10))
                .extracting(SearchResult::path)
                .containsExactly("wiki/concepts/vector-search.md");
    }

    private DocumentRecord doc(String path, String title, String body) {
        return new DocumentRecord(
                UUID.nameUUIDFromBytes(path.getBytes()),
                path,
                title,
                "concept",
                Instant.now(),
                body);
    }

    private VaultPathResolver resolver() {
        return new VaultPathResolver(properties());
    }

    private AppProperties properties() {
        return new AppProperties(
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
    }

    private static class StubEmbeddingClient implements EmbeddingClient {
        int passageCalls;

        @Override
        public List<float[]> embedPassages(List<String> texts) {
            passageCalls += 1;
            return texts.stream()
                    .map(text -> text.contains("alpha") ? new float[] {1, 0} : new float[] {0, 1})
                    .toList();
        }

        @Override
        public float[] embedQuery(String text) {
            return text.contains("alpha") ? new float[] {1, 0} : new float[] {0, 1};
        }
    }

    private static com.dpswikillm.repositories.AppSettingRepository emptySettings() {
        com.dpswikillm.repositories.AppSettingRepository repo =
                org.mockito.Mockito.mock(com.dpswikillm.repositories.AppSettingRepository.class);
        org.mockito.Mockito.when(repo.findById(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(java.util.Optional.empty());
        return repo;
    }

    private static class FakeRepository implements DocumentIndexRepository {
        List<DocumentRecord> documents = new ArrayList<>();
        Map<UUID, String> embeddingHashes = new LinkedHashMap<>();
        Map<UUID, float[]> vectors = new LinkedHashMap<>();
        Map<UUID, Double> hubness = new LinkedHashMap<>();

        @Override
        public void replaceDocuments(List<DocumentRecord> documents) {
            this.documents = new ArrayList<>(documents);
        }

        @Override
        public void upsertDocument(DocumentRecord document) {
            documents.removeIf(d -> d.path().equals(document.path()));
            documents.add(document);
        }

        @Override
        public void deleteDocument(String path) {
            documents.removeIf(d -> d.path().equals(path));
        }

        @Override
        public List<DocumentRecord> findAllDocuments() {
            return documents;
        }

        @Override
        public Map<UUID, String> findEmbeddingHashes(String model) {
            return new LinkedHashMap<>(embeddingHashes);
        }

        @Override
        public void upsertEmbedding(
                UUID documentId,
                String model,
                int dimension,
                float[] embedding,
                String normalizedTextHash) {
            embeddingHashes.put(documentId, normalizedTextHash);
            vectors.put(documentId, embedding);
        }

        @Override
        public void pruneEmbeddingsNotIn(String model, List<UUID> documentIds) {
            embeddingHashes.keySet().removeIf(id -> !documentIds.contains(id));
            vectors.keySet().removeIf(id -> !documentIds.contains(id));
            hubness.keySet().removeIf(id -> !documentIds.contains(id));
        }

        @Override
        public List<SearchResult> semanticSearch(float[] queryVector, int limit) {
            return documents.stream()
                    .filter(doc -> vectors.containsKey(doc.id()))
                    .map(
                            doc ->
                                    new SearchResult(
                                            doc.path(),
                                            doc.title(),
                                            doc.docType(),
                                            cosine(queryVector, vectors.get(doc.id())),
                                            doc.body()))
                    .sorted(Comparator.comparingDouble(SearchResult::score).reversed())
                    .limit(limit)
                    .toList();
        }

        @Override
        public List<SearchResult> semanticSearchByType(
                float[] queryVector, String docType, int limit) {
            return documents.stream()
                    .filter(doc -> vectors.containsKey(doc.id()))
                    .filter(doc -> docType.equals(doc.docType()))
                    .map(
                            doc ->
                                    new SearchResult(
                                            doc.path(),
                                            doc.title(),
                                            doc.docType(),
                                            cosine(queryVector, vectors.get(doc.id())),
                                            doc.body()))
                    .sorted(Comparator.comparingDouble(SearchResult::score).reversed())
                    .limit(limit)
                    .toList();
        }

        @Override
        public List<SearchResult> lexicalLookup(String query, int limit) {
            String lower = query.toLowerCase();
            return documents.stream()
                    .filter(
                            doc ->
                                    (doc.title() + " " + doc.path() + " " + doc.body())
                                            .toLowerCase()
                                            .contains(lower))
                    .map(
                            doc ->
                                    new SearchResult(
                                            doc.path(),
                                            doc.title(),
                                            doc.docType(),
                                            1.0,
                                            doc.body()))
                    .limit(limit)
                    .toList();
        }

        private double cosine(float[] a, float[] b) {
            double dot = 0;
            double an = 0;
            double bn = 0;
            for (int i = 0; i < a.length; i += 1) {
                dot += a[i] * b[i];
                an += a[i] * a[i];
                bn += b[i] * b[i];
            }
            return dot / (Math.sqrt(an) * Math.sqrt(bn));
        }

        @Override
        public List<SimilarPair> findSimilarPairsByDocType(
                String model, String docType, double threshold) {
            return List.of();
        }

        @Override
        public List<DocumentRecord> findDocumentsByDocType(String docType) {
            return documents.stream().filter(d -> docType.equals(d.docType())).toList();
        }

        @Override
        public java.util.Set<String> findEmbeddedPathsByDocType(String model, String docType) {
            return java.util.Set.of();
        }

        @Override
        public Optional<Instant> findEmbeddingStatus(String path) {
            return Optional.empty();
        }

        @Override
        public Optional<Double> computeScore(String srcPath, String tgtPath) {
            return Optional.empty();
        }

        @Override
        public Optional<Double> computeHubness(UUID documentId, String model, int k) {
            float[] self = vectors.get(documentId);
            if (self == null) {
                return Optional.empty();
            }
            List<Double> sims = new ArrayList<>();
            for (Map.Entry<UUID, float[]> entry : vectors.entrySet()) {
                if (!entry.getKey().equals(documentId)) {
                    sims.add(cosine(self, entry.getValue()));
                }
            }
            if (sims.isEmpty()) {
                return Optional.empty();
            }
            sims.sort(Comparator.reverseOrder());
            List<Double> top = sims.subList(0, Math.min(k, sims.size()));
            return Optional.of(top.stream().mapToDouble(Double::doubleValue).average().orElse(0));
        }

        @Override
        public void updateHubness(UUID documentId, String model, double value) {
            hubness.put(documentId, value);
        }

        @Override
        public Map<String, Double> findHubnessByPath(String model) {
            Map<String, Double> byPath = new LinkedHashMap<>();
            for (DocumentRecord doc : documents) {
                Double value = hubness.get(doc.id());
                if (value != null) {
                    byPath.put(doc.path(), value);
                }
            }
            return byPath;
        }

        @Override
        public List<UUID> findDocumentIdsMissingHubness(String model) {
            return vectors.keySet().stream().filter(id -> !hubness.containsKey(id)).toList();
        }

        @Override
        public GlobalSimilarityStats sampleGlobalSimilarityStats(String model, int sampleSize) {
            return new GlobalSimilarityStats(0, 0, 0, 0, 0);
        }
    }
}
