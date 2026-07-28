package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.DocumentIndexRepository.GlobalSimilarityStats;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

/**
 * Read-only calibration/verification for link-discovery ranking: reports the global pairwise cosine
 * distribution (to make the model's anisotropy observable) and scores a checked-in benchmark of
 * labeled note pairs with both raw cosine and CSLS, so the acceptance margin and {@code k} can be
 * tuned and the fix verified.
 */
@Service
public class LinkDiagnosticsService {
    private static final String BENCHMARK_RESOURCE = "link-discovery-benchmark.json";
    private static final int SAMPLE_SIZE = 120;

    private final DocumentIndexRepository repository;
    private final AppProperties properties;
    private final AppSettingRepository settingRepository;
    private final ObjectMapper objectMapper;

    public LinkDiagnosticsService(
            DocumentIndexRepository repository,
            AppProperties properties,
            AppSettingRepository settingRepository,
            ObjectMapper objectMapper) {
        this.repository = repository;
        this.properties = properties;
        this.settingRepository = settingRepository;
        this.objectMapper = objectMapper;
    }

    public record BenchmarkPair(String src, String tgt, boolean related, String note) {}

    public record BenchmarkResult(
            String src,
            String tgt,
            boolean expectedRelated,
            Double cosine,
            Double rkSrc,
            Double rkTgt,
            Double csls,
            Boolean predictedRelated,
            Boolean correct) {}

    public record Diagnostics(
            GlobalSimilarityStats distribution,
            double margin,
            int k,
            int sampleSize,
            List<BenchmarkResult> benchmark) {}

    public Diagnostics run() {
        String model = properties.embeddings().model();
        double margin = LinkRankingSettings.cslsMargin(settingRepository);
        int k = LinkRankingSettings.hubnessK(settingRepository);
        GlobalSimilarityStats distribution =
                repository.sampleGlobalSimilarityStats(model, SAMPLE_SIZE);
        Map<String, Double> hubnessByPath = repository.findHubnessByPath(model);

        List<BenchmarkResult> results =
                loadBenchmark().stream()
                        .map(pair -> evaluate(pair, hubnessByPath, margin))
                        .toList();
        return new Diagnostics(distribution, margin, k, SAMPLE_SIZE, results);
    }

    private BenchmarkResult evaluate(
            BenchmarkPair pair, Map<String, Double> hubnessByPath, double margin) {
        Double cosine = repository.computeScore(pair.src(), pair.tgt()).orElse(null);
        Double rkSrc = hubnessByPath.get(pair.src());
        Double rkTgt = hubnessByPath.get(pair.tgt());
        Double csls =
                (cosine != null && rkSrc != null && rkTgt != null)
                        ? LinkRankingSettings.csls(cosine, rkSrc, rkTgt)
                        : null;
        Boolean predicted = csls != null ? csls >= margin : null;
        Boolean correct = predicted != null ? predicted == pair.related() : null;
        return new BenchmarkResult(
                pair.src(),
                pair.tgt(),
                pair.related(),
                cosine,
                rkSrc,
                rkTgt,
                csls,
                predicted,
                correct);
    }

    private List<BenchmarkPair> loadBenchmark() {
        try (InputStream in = new ClassPathResource(BENCHMARK_RESOURCE).getInputStream()) {
            return objectMapper.readValue(in, new TypeReference<List<BenchmarkPair>>() {});
        } catch (IOException ex) {
            throw new UncheckedIOException("Failed to load " + BENCHMARK_RESOURCE, ex);
        }
    }
}
