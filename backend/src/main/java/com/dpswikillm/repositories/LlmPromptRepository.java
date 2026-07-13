package com.dpswikillm.repositories;

import com.dpswikillm.domain.LlmPrompt;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LlmPromptRepository extends JpaRepository<LlmPrompt, String> {

    Optional<LlmPrompt> findByKey(String key);
}
