package com.dpswikillm.repositories;

import com.dpswikillm.domain.LoginEvent;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoginEventRepository extends JpaRepository<LoginEvent, UUID> {

    List<LoginEvent> findTop20ByUsernameOrderByCreatedAtDesc(String username);
}
