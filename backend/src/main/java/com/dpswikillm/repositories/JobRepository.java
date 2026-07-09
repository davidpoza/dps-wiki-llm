package com.dpswikillm.repositories;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobRepository extends JpaRepository<Job, UUID> {
    long countByStatus(JobStatus status);

    List<Job> findByCreatedAtAfterOrderByCreatedAtAsc(Instant createdAt);
}
