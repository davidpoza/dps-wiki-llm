package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.DocumentRecord;
import com.dpswikillm.dto.ChatMessage;
import com.dpswikillm.dto.ConceptDedupGroup;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.DocumentIndexRepository.SimilarPair;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ConceptDedupScanService {
    private static final Logger log = LoggerFactory.getLogger(ConceptDedupScanService.class);
    private static final String CONCEPT_DOC_TYPE = "concept";
    private static final String DEDUP_JUDGE_PROMPT_KEY = "concept-dedup-judge-system";
    private static final String THRESHOLD_SETTING_KEY = "concept.dedup-similarity-threshold";
    private static final double DEFAULT_THRESHOLD = 0.88;
    private static final long JUDGE_TIMEOUT_SECONDS = 5;

    public record ScanProgress(String step, String message, int current, int total) {}

    private final DocumentIndexRepository repository;
    private final AppSettingRepository settingRepository;
    private final AppProperties properties;
    private final LlmClient llmClient;
    private final PromptService promptService;
    private final ObjectMapper objectMapper;

    public ConceptDedupScanService(
            DocumentIndexRepository repository,
            AppSettingRepository settingRepository,
            AppProperties properties,
            LlmClient llmClient,
            PromptService promptService,
            ObjectMapper objectMapper) {
        this.repository = repository;
        this.settingRepository = settingRepository;
        this.properties = properties;
        this.llmClient = llmClient;
        this.promptService = promptService;
        this.objectMapper = objectMapper;
    }

    public List<ConceptDedupGroup> scan(Consumer<ScanProgress> onProgress) {
        double threshold = readThreshold();
        String model = properties.embeddings().model();

        List<DocumentRecord> allConcepts = repository.findDocumentsByDocType(CONCEPT_DOC_TYPE);
        int total = allConcepts.size();
        Map<String, DocumentRecord> byPath = new LinkedHashMap<>();
        for (DocumentRecord doc : allConcepts) {
            byPath.put(doc.path(), doc);
        }

        Set<String> pathsWithEmbeddings = new LinkedHashSet<>();

        List<SimilarPair> pairs =
                repository.findSimilarPairsByDocType(model, CONCEPT_DOC_TYPE, threshold);

        for (SimilarPair pair : pairs) {
            pathsWithEmbeddings.add(pair.path1());
            pathsWithEmbeddings.add(pair.path2());
        }

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

        List<List<String>> rawGroups = buildTransitiveGroups(pairs);

        List<ConceptDedupGroup> result = new ArrayList<>();
        for (List<String> group : rawGroups) {
            if (group.size() < 2) continue;
            ConceptDedupGroup confirmed = callJudge(group, byPath);
            if (confirmed != null) {
                result.add(confirmed);
            }
        }
        return result;
    }

    private List<List<String>> buildTransitiveGroups(List<SimilarPair> pairs) {
        Map<String, String> parent = new LinkedHashMap<>();

        for (SimilarPair pair : pairs) {
            String r1 = find(parent, pair.path1());
            String r2 = find(parent, pair.path2());
            if (!r1.equals(r2)) {
                parent.put(r2, r1);
            }
        }

        Map<String, List<String>> groups = new LinkedHashMap<>();
        for (String path : parent.keySet()) {
            String root = find(parent, path);
            groups.computeIfAbsent(root, k -> new ArrayList<>()).add(path);
        }
        for (SimilarPair pair : pairs) {
            String root1 = find(parent, pair.path1());
            String root2 = find(parent, pair.path2());
            groups.computeIfAbsent(root1, k -> new ArrayList<>());
            groups.computeIfAbsent(root2, k -> new ArrayList<>());
            if (!groups.get(root1).contains(pair.path1())) groups.get(root1).add(pair.path1());
            if (!groups.get(root1).contains(pair.path2())) groups.get(root1).add(pair.path2());
        }

        List<List<String>> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (SimilarPair pair : pairs) {
            String root = find(parent, pair.path1());
            if (seen.add(root)) {
                result.add(groups.get(root));
            }
        }
        return result;
    }

    private String find(Map<String, String> parent, String node) {
        parent.putIfAbsent(node, node);
        if (parent.get(node).equals(node)) return node;
        String root = find(parent, parent.get(node));
        parent.put(node, root);
        return root;
    }

    private ConceptDedupGroup callJudge(List<String> paths, Map<String, DocumentRecord> byPath) {
        String systemPrompt = promptService.getText(DEDUP_JUDGE_PROMPT_KEY);
        String userMessage = buildJudgeMessage(paths, byPath);
        try {
            String response =
                    CompletableFuture.supplyAsync(
                                    () ->
                                            llmClient.chatJson(
                                                    List.of(
                                                            new ChatMessage("system", systemPrompt),
                                                            new ChatMessage("user", userMessage))))
                            .get(JUDGE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return parseJudgeResponse(response, paths, byPath);
        } catch (TimeoutException ex) {
            log.warn("Concept dedup judge timed out for group {} — skipping", paths);
            return null;
        } catch (Exception ex) {
            log.warn(
                    "Concept dedup judge failed for group {}: {} — skipping",
                    paths,
                    ex.getMessage());
            return null;
        }
    }

    private String buildJudgeMessage(List<String> paths, Map<String, DocumentRecord> byPath) {
        StringBuilder sb = new StringBuilder();
        sb.append("Evaluate if these concept files all refer to the same concept:\n\n");
        for (String path : paths) {
            DocumentRecord doc = byPath.get(path);
            String slug = slugFromPath(path);
            String snippet =
                    doc != null && doc.body() != null
                            ? (doc.body().length() > 300
                                    ? doc.body().substring(0, 300) + "..."
                                    : doc.body())
                            : "";
            sb.append("- slug: ").append(slug).append("\n");
            sb.append("  excerpt: ").append(snippet).append("\n\n");
        }
        return sb.toString();
    }

    private ConceptDedupGroup parseJudgeResponse(
            String response, List<String> paths, Map<String, DocumentRecord> byPath) {
        try {
            int start = response.indexOf('{');
            int end = response.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            JsonNode node = objectMapper.readTree(response.substring(start, end + 1));
            JsonNode isSame = node.get("isSameConceptGroup");
            if (isSame == null || !isSame.asBoolean()) return null;
            JsonNode canonicalNode = node.get("canonicalFilename");
            String canonical =
                    canonicalNode != null && !canonicalNode.isNull()
                            ? canonicalNode.asText().trim()
                            : null;
            canonical = normalizeCanonical(canonical, paths, byPath);
            if (canonical == null) return null;
            List<String> slugs = paths.stream().map(this::slugFromPath).toList();
            double avgScore = 0.88;
            return new ConceptDedupGroup(canonical, slugs, avgScore);
        } catch (Exception ex) {
            log.warn("Failed to parse concept dedup judge response: {}", response);
            return null;
        }
    }

    private String normalizeCanonical(
            String proposed, List<String> paths, Map<String, DocumentRecord> byPath) {
        if (proposed == null || proposed.isBlank()) {
            return oldestSlug(paths, byPath);
        }
        String normalized =
                proposed.toLowerCase()
                        .replaceAll("[^a-z0-9-]", "-")
                        .replaceAll("-+", "-")
                        .replaceAll("^-|-$", "");
        if (normalized.isBlank()) return oldestSlug(paths, byPath);
        return normalized;
    }

    private String oldestSlug(List<String> paths, Map<String, DocumentRecord> byPath) {
        return paths.stream()
                .min(
                        (a, b) -> {
                            DocumentRecord da = byPath.get(a);
                            DocumentRecord db = byPath.get(b);
                            if (da == null) return 1;
                            if (db == null) return -1;
                            if (da.updatedAt() == null) return 1;
                            if (db.updatedAt() == null) return -1;
                            return da.updatedAt().compareTo(db.updatedAt());
                        })
                .map(this::slugFromPath)
                .orElse(null);
    }

    private double readThreshold() {
        return settingRepository
                .findById(THRESHOLD_SETTING_KEY)
                .map(
                        s -> {
                            try {
                                return Double.parseDouble(s.getValue());
                            } catch (NumberFormatException ex) {
                                return DEFAULT_THRESHOLD;
                            }
                        })
                .orElse(DEFAULT_THRESHOLD);
    }

    private String slugFromPath(String path) {
        String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        if (filename.endsWith(".md")) filename = filename.substring(0, filename.length() - 3);
        return filename;
    }
}
