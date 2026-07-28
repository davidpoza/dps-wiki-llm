package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.domain.ConnectionCandidateSource;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ConnectionDiscoveryService {
    private static final Logger log = LoggerFactory.getLogger(ConnectionDiscoveryService.class);
    private static final double DEFAULT_THRESHOLD = 0.72;
    private static final String THRESHOLD_SETTING_KEY = "link.connection-threshold";
    private static final int DEFAULT_NEIGHBOR_LIMIT = 8;
    private static final String TOPIC_DOC_TYPE = "topic";
    private static final int TOPIC_CONNECTION_LIMIT = 3;

    private final SemanticSearchService semanticSearchService;
    private final JobConnectionCandidateRepository candidateRepository;
    private final JobLifecycleService lifecycleService;
    private final AppSettingRepository settingRepository;
    private final DocumentIndexRepository documentIndexRepository;
    private final AppProperties properties;

    public ConnectionDiscoveryService(
            SemanticSearchService semanticSearchService,
            JobConnectionCandidateRepository candidateRepository,
            JobLifecycleService lifecycleService,
            AppSettingRepository settingRepository,
            DocumentIndexRepository documentIndexRepository,
            AppProperties properties) {
        this.semanticSearchService = semanticSearchService;
        this.candidateRepository = candidateRepository;
        this.lifecycleService = lifecycleService;
        this.settingRepository = settingRepository;
        this.documentIndexRepository = documentIndexRepository;
        this.properties = properties;
    }

    public List<JobConnectionCandidate> discoverAndPersist(
            Job job, NormalizedSourcePayload payload, String sourceNotePath, MutationPlan llmPlan) {
        Map<String, JobConnectionCandidate> candidates = new LinkedHashMap<>();

        List<MutationAction> llmActions =
                llmPlan.pageActions() == null
                        ? List.of()
                        : llmPlan.pageActions().stream()
                                .filter(
                                        a ->
                                                a.action() == MutationActionType.update
                                                        && a.path() != null)
                                .toList();

        String query = buildQuery(payload);
        double coarseThreshold = readThreshold();
        double margin = LinkRankingSettings.cslsMargin(settingRepository);
        int k = LinkRankingSettings.hubnessK(settingRepository);
        Map<String, Double> hubnessByPath =
                documentIndexRepository.findHubnessByPath(properties.embeddings().model());

        List<SearchResult> generalNeighbors =
                semanticSearchService.search(query, DEFAULT_NEIGHBOR_LIMIT).stream()
                        .filter(r -> !r.path().equals(sourceNotePath))
                        .toList();
        Double storedRkA = hubnessByPath.get(sourceNotePath);
        double rkA = storedRkA != null ? storedRkA : CslsRanker.meanTopK(generalNeighbors, k);
        List<SearchResult> semanticResults =
                CslsRanker.select(
                        generalNeighbors,
                        rkA,
                        hubnessByPath,
                        coarseThreshold,
                        margin,
                        DEFAULT_NEIGHBOR_LIMIT);
        // Dedicated topic search so curated wiki/topics/ hubs surface on their own, without
        // competing against far more similar source notes in the general top-N.
        List<SearchResult> topicNeighbors =
                semanticSearchService
                        .searchByType(query, TOPIC_DOC_TYPE, TOPIC_CONNECTION_LIMIT)
                        .stream()
                        .filter(r -> !r.path().equals(sourceNotePath))
                        .toList();
        List<SearchResult> topicResults =
                CslsRanker.select(
                        topicNeighbors,
                        rkA,
                        hubnessByPath,
                        coarseThreshold,
                        margin,
                        TOPIC_CONNECTION_LIMIT);

        int total = llmActions.size() + semanticResults.size() + topicResults.size();
        int idx = 0;

        for (MutationAction action : llmActions) {
            idx++;
            lifecycleService.progress(
                    job,
                    "connection-discovery-scan",
                    action.path(),
                    "{\"current\":" + idx + ",\"total\":" + total + "}");
            candidates.putIfAbsent(
                    "llm:" + action.path(),
                    candidate(
                            job,
                            action.path(),
                            sourceNotePath,
                            "Related",
                            ConnectionCandidateSource.llm,
                            1.0));
        }

        for (SearchResult result : semanticResults) {
            idx++;
            lifecycleService.progress(
                    job,
                    "connection-discovery-scan",
                    result.path(),
                    "{\"current\":" + idx + ",\"total\":" + total + "}");
            candidates.putIfAbsent(
                    "semantic:" + result.path(),
                    candidate(
                            job,
                            result.path(),
                            sourceNotePath,
                            "Related",
                            ConnectionCandidateSource.semantic,
                            result.score()));
        }

        Set<String> existingTargets =
                candidates.values().stream()
                        .map(JobConnectionCandidate::getTargetPath)
                        .collect(Collectors.toSet());
        for (SearchResult result : topicResults) {
            idx++;
            lifecycleService.progress(
                    job,
                    "connection-discovery-scan",
                    result.path(),
                    "{\"current\":" + idx + ",\"total\":" + total + "}");
            if (existingTargets.contains(result.path())) {
                continue;
            }
            candidates.putIfAbsent(
                    "topic:" + result.path(),
                    candidate(
                            job,
                            result.path(),
                            sourceNotePath,
                            "Related",
                            ConnectionCandidateSource.topic,
                            result.score()));
        }

        return candidateRepository.saveAll(candidates.values());
    }

    private double readThreshold() {
        return settingRepository
                .findById(THRESHOLD_SETTING_KEY)
                .map(
                        s -> {
                            try {
                                return Double.parseDouble(s.getValue());
                            } catch (NumberFormatException ex) {
                                log.warn(
                                        "Invalid link.connection-threshold value '{}', using default {}",
                                        s.getValue(),
                                        DEFAULT_THRESHOLD);
                                return DEFAULT_THRESHOLD;
                            }
                        })
                .orElse(DEFAULT_THRESHOLD);
    }

    private static String buildQuery(NormalizedSourcePayload payload) {
        var note = payload.sourceNote();
        if (note != null && note.keywords() != null && !note.keywords().isEmpty()) {
            String joined =
                    note.keywords().stream()
                            .map(k -> k.replace('-', ' '))
                            .collect(Collectors.joining(", "));
            return "Primary topic: "
                    + payload.title().replace('-', ' ')
                    + ". Related concepts: "
                    + joined
                    + ".";
        }
        return payload.title();
    }

    private JobConnectionCandidate candidate(
            Job job,
            String targetPath,
            String sourceNotePath,
            String section,
            ConnectionCandidateSource source,
            double score) {
        JobConnectionCandidate candidate = new JobConnectionCandidate();
        candidate.setJobId(job.getId());
        candidate.setTargetPath(targetPath);
        candidate.setProposedLink(sourceNotePath);
        candidate.setProposedSection(section);
        candidate.setSource(source);
        candidate.setScore(score);
        candidate.setDecision(ConnectionCandidateDecision.pending);
        return candidate;
    }
}
