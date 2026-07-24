package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.dto.ChatMessage;
import com.dpswikillm.dto.ConceptDedupGroup;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ConceptDedupScanService {
    private static final Logger log = LoggerFactory.getLogger(ConceptDedupScanService.class);
    private static final String CONCEPT_DOC_TYPE = "concept";
    private static final String BATCH_JUDGE_PROMPT_KEY = "concept-batch-dedup-system";
    private static final long BATCH_JUDGE_TIMEOUT_MS = 300_000L;
    private static final long HEARTBEAT_INTERVAL_MS = 10_000L;

    public record ScanProgress(String step, String message, int current, int total) {}

    private final DocumentIndexRepository repository;
    private final AppProperties properties;
    private final LlmClient llmClient;
    private final PromptService promptService;
    private final ObjectMapper objectMapper;

    public ConceptDedupScanService(
            DocumentIndexRepository repository,
            AppProperties properties,
            LlmClient llmClient,
            PromptService promptService,
            ObjectMapper objectMapper) {
        this.repository = repository;
        this.properties = properties;
        this.llmClient = llmClient;
        this.promptService = promptService;
        this.objectMapper = objectMapper;
    }

    public List<ConceptDedupGroup> scan(Consumer<ScanProgress> onProgress) {
        String model = properties.embeddings().model();

        List<DocumentRecord> allConcepts = repository.findDocumentsByDocType(CONCEPT_DOC_TYPE);
        int total = allConcepts.size();

        Set<String> pathsWithEmbeddings =
                repository.findEmbeddedPathsByDocType(model, CONCEPT_DOC_TYPE);

        int current = 0;
        for (DocumentRecord doc : allConcepts) {
            current++;
            if (!pathsWithEmbeddings.contains(doc.path())) {
                onProgress.accept(
                        new ScanProgress("concept-dedup-warning", doc.path(), current, total));
            } else {
                onProgress.accept(
                        new ScanProgress("concept-dedup-scan", doc.path(), current, total));
            }
        }

        if (allConcepts.isEmpty()) {
            return List.of();
        }

        onProgress.accept(new ScanProgress("concept-dedup-judge", "", 1, 1));
        return callBatchJudge(allConcepts, onProgress);
    }

    private List<ConceptDedupGroup> callBatchJudge(
            List<DocumentRecord> concepts, Consumer<ScanProgress> onProgress) {
        String systemPrompt = promptService.getText(BATCH_JUDGE_PROMPT_KEY);
        String userMessage = buildBatchMessage(concepts);
        CompletableFuture<String> llmFuture =
                CompletableFuture.supplyAsync(
                        () ->
                                llmClient.chatJson(
                                        List.of(
                                                new ChatMessage("system", systemPrompt),
                                                new ChatMessage("user", userMessage))));
        long deadline = System.currentTimeMillis() + BATCH_JUDGE_TIMEOUT_MS;
        while (true) {
            long remaining = deadline - System.currentTimeMillis();
            if (remaining <= 0) {
                llmFuture.cancel(true);
                log.warn("Batch dedup judge timed out after {} ms", BATCH_JUDGE_TIMEOUT_MS);
                return List.of();
            }
            long wait = Math.min(remaining, HEARTBEAT_INTERVAL_MS);
            try {
                String response = llmFuture.get(wait, TimeUnit.MILLISECONDS);
                return parseBatchResponse(response, concepts);
            } catch (TimeoutException ex) {
                onProgress.accept(new ScanProgress("concept-dedup-judge", "waiting", 1, 1));
            } catch (Exception ex) {
                log.warn("Batch dedup judge failed: {}", ex.getMessage());
                return List.of();
            }
        }
    }

    private String buildBatchMessage(List<DocumentRecord> concepts) {
        StringBuilder sb = new StringBuilder("Concept slugs:\n");
        for (DocumentRecord doc : concepts) {
            String slug = slugFromPath(doc.path());
            sb.append("- ").append(slug);
            if (doc.title() != null
                    && !doc.title().isBlank()
                    && !doc.title().equalsIgnoreCase(slug)) {
                sb.append(" (").append(doc.title()).append(")");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private List<ConceptDedupGroup> parseBatchResponse(
            String response, List<DocumentRecord> allConcepts) {
        try {
            int start = response.indexOf('[');
            int end = response.lastIndexOf(']');
            if (start < 0 || end <= start) return List.of();
            JsonNode array = objectMapper.readTree(response.substring(start, end + 1));
            if (!array.isArray()) return List.of();

            Set<String> validSlugs =
                    allConcepts.stream()
                            .map(d -> slugFromPath(d.path()))
                            .collect(Collectors.toSet());

            List<ConceptDedupGroup> result = new ArrayList<>();
            for (JsonNode node : array) {
                JsonNode canonicalNode = node.get("canonical");
                JsonNode filesNode = node.get("files");
                if (canonicalNode == null || filesNode == null || !filesNode.isArray()) continue;

                String canonical = normalizeSlug(canonicalNode.asText());
                if (canonical.isBlank()) continue;

                List<String> files = new ArrayList<>();
                for (JsonNode f : filesNode) {
                    String slug = f.asText().trim();
                    if (validSlugs.contains(slug) && !files.contains(slug)) {
                        files.add(slug);
                    }
                }
                if (files.size() < 2) continue;
                if (!files.contains(canonical)) {
                    canonical = files.get(0);
                }

                result.add(new ConceptDedupGroup(canonical, files, 1.0));
            }
            return result;
        } catch (Exception ex) {
            log.warn(
                    "Failed to parse batch dedup response: {}",
                    response.substring(0, Math.min(200, response.length())));
            return List.of();
        }
    }

    private String normalizeSlug(String proposed) {
        if (proposed == null || proposed.isBlank()) return "";
        return proposed.toLowerCase()
                .replaceAll("[^a-z0-9-]", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
    }

    private String slugFromPath(String path) {
        String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        if (filename.endsWith(".md")) filename = filename.substring(0, filename.length() - 3);
        return filename;
    }
}
