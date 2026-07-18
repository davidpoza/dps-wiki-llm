package com.dpswikillm.repositories;

import com.dpswikillm.domain.SnapshotFile;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SnapshotFileRepository extends JpaRepository<SnapshotFile, UUID> {
    List<SnapshotFile> findBySnapshotId(UUID snapshotId);

    Optional<SnapshotFile> findBySnapshotIdAndPath(UUID snapshotId, String path);

    List<SnapshotFile> findByPath(String path);

    void deleteBySnapshotId(UUID snapshotId);
}
