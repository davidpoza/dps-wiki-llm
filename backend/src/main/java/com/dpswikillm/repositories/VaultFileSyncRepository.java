package com.dpswikillm.repositories;

import com.dpswikillm.domain.VaultFileSync;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VaultFileSyncRepository extends JpaRepository<VaultFileSync, String> {
    List<VaultFileSync> findByConflictTrue();
}
