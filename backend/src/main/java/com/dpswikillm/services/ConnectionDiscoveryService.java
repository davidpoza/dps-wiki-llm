package com.dpswikillm.services;

import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.domain.ConnectionCandidateSource;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobConnectionCandidate;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ConnectionDiscoveryService {
    private static final double DEFAULT_THRESHOLD = 0.72;
    private static final int DEFAULT_NEIGHBOR_LIMIT = 8;

    private final SemanticSearchService semanticSearchService;
    private final JobConnectionCandidateRepository candidateRepository;
    private final JobLifecycleService lifecycleService;

    public ConnectionDiscoveryService(SemanticSearchService semanticSearchService,
                                      JobConnectionCandidateRepository candidateRepository,
                                      JobLifecycleService lifecycleService) {
        this.semanticSearchService = semanticSearchService;
        this.candidateRepository = candidateRepository;
        this.lifecycleService = lifecycleService;
    }

    public List<JobConnectionCandidate> discoverAndPersist(Job job, NormalizedSourcePayload payload,
                                                           String sourceNotePath, MutationPlan llmPlan) {
        Map<String, JobConnectionCandidate> candidates = new LinkedHashMap<>();

        List<MutationAction> llmActions = llmPlan.pageActions() == null ? List.of()
                : llmPlan.pageActions().stream()
                        .filter(a -> a.action() == MutationActionType.update && a.path() != null)
                        .toList();

        String query = buildQuery(payload);
        List<SearchResult> semanticResults = semanticSearchService.search(query, DEFAULT_NEIGHBOR_LIMIT).stream()
                .filter(r -> r.score() >= DEFAULT_THRESHOLD && !r.path().equals(sourceNotePath))
                .toList();

        int total = llmActions.size() + semanticResults.size();
        int idx = 0;

        for (MutationAction action : llmActions) {
            idx++;
            lifecycleService.progress(job, "connection-discovery-scan", action.path(),
                    "{\"current\":" + idx + ",\"total\":" + total + "}");
            candidates.putIfAbsent("llm:" + action.path(), candidate(job, action.path(), sourceNotePath,
                    "Related", ConnectionCandidateSource.llm, 1.0));
        }

        for (SearchResult result : semanticResults) {
            idx++;
            lifecycleService.progress(job, "connection-discovery-scan", result.path(),
                    "{\"current\":" + idx + ",\"total\":" + total + "}");
            candidates.putIfAbsent("semantic:" + result.path(), candidate(job, result.path(), sourceNotePath,
                    "Related", ConnectionCandidateSource.semantic, result.score()));
        }

        return candidateRepository.saveAll(candidates.values());
    }

    private static String buildQuery(NormalizedSourcePayload payload) {
        var note = payload.sourceNote();
        if (note != null && note.keywords() != null && !note.keywords().isEmpty()) {
            return String.join(" ", note.keywords());
        }
        return payload.title();
    }

    private JobConnectionCandidate candidate(Job job, String targetPath, String sourceNotePath, String section,
                                             ConnectionCandidateSource source, double score) {
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
