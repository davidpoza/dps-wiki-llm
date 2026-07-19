package com.dpswikillm;

import com.dpswikillm.repositories.DocumentIndexRepository;
import com.dpswikillm.repositories.AppSettingRepository;
import com.dpswikillm.repositories.JobConnectionCandidateRepository;
import com.dpswikillm.repositories.JobRepository;
import com.dpswikillm.repositories.LlmPromptRepository;
import com.dpswikillm.repositories.LoginEventRepository;
import com.dpswikillm.repositories.OperationRepository;
import com.dpswikillm.repositories.SnapshotFileRepository;
import com.dpswikillm.repositories.SnapshotRepository;
import com.dpswikillm.repositories.UserRepository;
import com.dpswikillm.repositories.VaultFileSyncRepository;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,"
                + "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration,"
                + "org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration"
})
class DpsWikiLlmApplicationTests {
    @MockBean
    AppSettingRepository appSettingRepository;

    @MockBean
    DocumentIndexRepository documentIndexRepository;

    @MockBean
    JobRepository jobRepository;

    @MockBean
    JobConnectionCandidateRepository jobConnectionCandidateRepository;

    @MockBean
    OperationRepository operationRepository;

    @MockBean
    LlmPromptRepository llmPromptRepository;

    @MockBean
    LoginEventRepository loginEventRepository;

    @MockBean
    UserRepository userRepository;

    @MockBean
    SnapshotRepository snapshotRepository;

    @MockBean
    SnapshotFileRepository snapshotFileRepository;

    @MockBean
    VaultFileSyncRepository vaultFileSyncRepository;

    @MockBean
    RabbitTemplate rabbitTemplate;

    @Test
    void contextLoads() {
    }
}
