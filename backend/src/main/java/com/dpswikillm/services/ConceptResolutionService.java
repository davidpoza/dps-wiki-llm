package com.dpswikillm.services;

import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ChatMessage;
import com.dpswikillm.repositories.AppSettingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ConceptResolutionService {
    private static final Logger log = LoggerFactory.getLogger(ConceptResolutionService.class);
    private static final String CONCEPT_DOC_TYPE = "concept";
    private static final int JUDGE_CANDIDATE_LIMIT = 3;
    private static final long JUDGE_TIMEOUT_SECONDS = 5;
    private static final double DEFAULT_THRESHOLD = 0.82;
    private static final String THRESHOLD_SETTING_KEY = "concept.similarity-threshold";
    private static final String JUDGE_PROMPT_KEY = "concept-judge-system";

    private final SemanticSearchService semanticSearchService;
    private final LlmClient llmClient;
    private final PromptService promptService;
    private final MarkdownService markdownService;
    private final VaultPathResolver pathResolver;
    private final AppSettingRepository settingRepository;
    private final ObjectMapper objectMapper;

    public ConceptResolutionService(SemanticSearchService semanticSearchService,
                                    LlmClient llmClient,
                                    PromptService promptService,
                                    MarkdownService markdownService,
                                    VaultPathResolver pathResolver,
                                    AppSettingRepository settingRepository,
                                    ObjectMapper objectMapper) {
        this.semanticSearchService = semanticSearchService;
        this.llmClient = llmClient;
        this.promptService = promptService;
        this.markdownService = markdownService;
        this.pathResolver = pathResolver;
        this.settingRepository = settingRepository;
        this.objectMapper = objectMapper;
    }

    public MutationPlan resolve(MutationPlan plan) {
        double threshold = readThreshold();
        List<MutationAction> resolved = new ArrayList<>();
        for (MutationAction action : plan.pageActions() == null ? List.<MutationAction>of() : plan.pageActions()) {
            resolved.add(resolveAction(action, threshold));
        }
        return new MutationPlan(plan.planId(), resolved);
    }

    private MutationAction resolveAction(MutationAction action, double threshold) {
        if (action.action() != MutationActionType.create || action.path() == null
                || !action.path().startsWith("wiki/concepts/")) {
            return action;
        }
        String conceptName = slugToName(action.path());
        List<SearchResult> candidates = semanticSearchService
                .searchByType(conceptName, CONCEPT_DOC_TYPE, JUDGE_CANDIDATE_LIMIT)
                .stream()
                .filter(r -> r.score() >= threshold)
                .toList();
        if (candidates.isEmpty()) {
            return action;
        }
        String matchedPath = callJudge(conceptName, candidates);
        if (matchedPath == null) {
            return action;
        }
        log.info("Concept '{}' matched to existing '{}' — rewriting create → update", action.path(), matchedPath);
        return buildUpdateAction(action, matchedPath);
    }

    private String callJudge(String conceptName, List<SearchResult> candidates) {
        String systemPrompt = promptService.getText(JUDGE_PROMPT_KEY);
        String userMessage = buildJudgeMessage(conceptName, candidates);
        try {
            String response = CompletableFuture
                    .supplyAsync(() -> llmClient.chatJson(List.of(
                            new ChatMessage("system", systemPrompt),
                            new ChatMessage("user", userMessage))))
                    .get(JUDGE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return extractMatch(response);
        } catch (TimeoutException ex) {
            log.warn("Concept judge timed out for '{}' — keeping original create action", conceptName);
            return null;
        } catch (Exception ex) {
            log.warn("Concept judge failed for '{}': {} — keeping original create action", conceptName, ex.getMessage());
            return null;
        }
    }

    private String buildJudgeMessage(String conceptName, List<SearchResult> candidates) {
        StringBuilder sb = new StringBuilder();
        sb.append("Proposed concept: ").append(conceptName).append("\n\n");
        sb.append("Existing concepts:\n");
        for (SearchResult candidate : candidates) {
            String snippet = candidate.body() != null && candidate.body().length() > 200
                    ? candidate.body().substring(0, 200) + "..."
                    : candidate.body();
            sb.append("- path: ").append(candidate.path())
              .append(", title: ").append(candidate.title())
              .append(", snippet: ").append(snippet).append("\n");
        }
        return sb.toString();
    }

    private String extractMatch(String response) {
        try {
            int start = response.indexOf('{');
            int end = response.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            JsonNode node = objectMapper.readTree(response.substring(start, end + 1));
            JsonNode matchNode = node.get("match");
            if (matchNode == null || matchNode.isNull()) return null;
            String path = matchNode.asText().trim();
            return path.isBlank() ? null : path;
        } catch (Exception ex) {
            log.warn("Failed to parse concept judge response: {}", response);
            return null;
        }
    }

    private MutationAction buildUpdateAction(MutationAction original, String targetPath) {
        Map<String, Object> frontmatter = mergeAliases(original, targetPath);
        return new MutationAction(MutationActionType.update, targetPath, original.title(),
                frontmatter, original.sections(), original.idempotencyKey());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mergeAliases(MutationAction original, String targetPath) {
        Map<String, Object> frontmatter = new LinkedHashMap<>(
                original.frontmatter() != null ? original.frontmatter() : Map.of());

        String proposedSlug = slugFromPath(original.path());
        Path existing = pathResolver.resolve(targetPath);
        if (Files.exists(existing)) {
            try {
                String existingContent = Files.readString(existing, StandardCharsets.UTF_8);
                Map<String, Object> existingFrontmatter = markdownService.parse(existingContent).frontmatter();
                Object existingAliases = existingFrontmatter.get("aliases");
                List<String> aliases = existingAliases instanceof List<?> list
                        ? new ArrayList<>((List<String>) list)
                        : new ArrayList<>();
                if (!aliases.contains(proposedSlug)) {
                    aliases.add(proposedSlug);
                    frontmatter.put("aliases", aliases);
                }
            } catch (IOException ex) {
                log.warn("Could not read existing concept file '{}' for alias merge: {}", targetPath, ex.getMessage());
            }
        }
        return frontmatter;
    }

    private double readThreshold() {
        return settingRepository.findById(THRESHOLD_SETTING_KEY)
                .map(s -> {
                    try {
                        return Double.parseDouble(s.getValue());
                    } catch (NumberFormatException ex) {
                        log.warn("Invalid concept.similarity-threshold value '{}', using default {}", s.getValue(), DEFAULT_THRESHOLD);
                        return DEFAULT_THRESHOLD;
                    }
                })
                .orElse(DEFAULT_THRESHOLD);
    }

    private static String slugToName(String path) {
        String slug = slugFromPath(path);
        return slug.replace('-', ' ');
    }

    private static String slugFromPath(String path) {
        String filename = path.substring("wiki/concepts/".length());
        if (filename.endsWith(".md")) {
            filename = filename.substring(0, filename.length() - 3);
        }
        return filename;
    }
}
