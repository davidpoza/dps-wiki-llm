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

    public ConnectionDiscoveryService(SemanticSearchService semanticSearchService,
                                      JobConnectionCandidateRepository candidateRepository) {
        this.semanticSearchService = semanticSearchService;
        this.candidateRepository = candidateRepository;
    }

    public List<JobConnectionCandidate> discoverAndPersist(Job job, NormalizedSourcePayload payload,
                                                           String sourceNotePath, MutationPlan llmPlan) {
        Map<String, JobConnectionCandidate> candidates = new LinkedHashMap<>();
        for (MutationAction action : llmPlan.pageActions() == null ? List.<MutationAction>of() : llmPlan.pageActions()) {
            if (action.action() != MutationActionType.update || action.path() == null) {
                continue;
            }
            candidates.putIfAbsent("llm:" + action.path(), candidate(job, action.path(), sourceNotePath,
                    "Related", ConnectionCandidateSource.llm, 1.0));
        }

        String query = payload.title() + "\n" + payload.content();
        for (SearchResult result : semanticSearchService.search(query, DEFAULT_NEIGHBOR_LIMIT)) {
            if (result.score() < DEFAULT_THRESHOLD || result.path().equals(sourceNotePath)) {
                continue;
            }
            candidates.putIfAbsent("semantic:" + result.path(), candidate(job, result.path(), sourceNotePath,
                    "Related", ConnectionCandidateSource.semantic, result.score()));
        }

        return candidateRepository.saveAll(candidates.values());
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
