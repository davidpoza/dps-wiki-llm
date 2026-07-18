package com.dpswikillm.repositories;

import com.dpswikillm.domain.SnapshotFile;
import com.dpswikillm.dto.FileHistoryEntryDto;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SnapshotFileRepository extends JpaRepository<SnapshotFile, UUID> {
    List<SnapshotFile> findBySnapshotId(UUID snapshotId);

    Optional<SnapshotFile> findBySnapshotIdAndPath(UUID snapshotId, String path);

    List<SnapshotFile> findByPath(String path);

    void deleteBySnapshotId(UUID snapshotId);

    @Query(value = """
            SELECT new com.dpswikillm.dto.FileHistoryEntryDto(
                sf.id, sf.path, s.source,
                COALESCE(sf.linesAdded, 0), COALESCE(sf.linesDeleted, 0),
                CAST(s.createdAt AS String)
            )
            FROM SnapshotFile sf, com.dpswikillm.domain.Snapshot s
            WHERE sf.snapshotId = s.id
              AND s.status = 'COMPLETE'
              AND (sf.linesAdded IS NULL OR sf.linesAdded > 0 OR sf.linesDeleted > 0)
            ORDER BY s.createdAt DESC
            """,
            countQuery = """
            SELECT COUNT(sf)
            FROM SnapshotFile sf, com.dpswikillm.domain.Snapshot s
            WHERE sf.snapshotId = s.id
              AND s.status = 'COMPLETE'
              AND (sf.linesAdded IS NULL OR sf.linesAdded > 0 OR sf.linesDeleted > 0)
            """)
    Page<FileHistoryEntryDto> findHistoryPaged(Pageable pageable);
}
