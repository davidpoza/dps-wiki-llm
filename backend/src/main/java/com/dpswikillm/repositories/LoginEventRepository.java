package com.dpswikillm.repositories;

import com.dpswikillm.domain.LoginEvent;
import com.dpswikillm.domain.User;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface LoginEventRepository extends JpaRepository<LoginEvent, UUID> {

    List<LoginEvent> findTop20ByUserOrderByCreatedAtDesc(User user);
}
