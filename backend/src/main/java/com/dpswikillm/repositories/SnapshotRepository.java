package com.dpswikillm.repositories;

import com.dpswikillm.domain.Snapshot;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SnapshotRepository extends JpaRepository<Snapshot, UUID> {
    List<Snapshot> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);
}
