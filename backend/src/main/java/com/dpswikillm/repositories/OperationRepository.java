package com.dpswikillm.repositories;

import com.dpswikillm.domain.Operation;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OperationRepository extends JpaRepository<Operation, UUID> {}
