package com.dpswikillm.repositories;

import com.dpswikillm.domain.ConnectionCandidateDecision;
import com.dpswikillm.domain.JobConnectionCandidate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobConnectionCandidateRepository extends JpaRepository<JobConnectionCandidate, UUID> {
    List<JobConnectionCandidate> findByJobIdOrderByCreatedAtAsc(UUID jobId);

    List<JobConnectionCandidate> findByJobIdAndDecision(UUID jobId, ConnectionCandidateDecision decision);
}
