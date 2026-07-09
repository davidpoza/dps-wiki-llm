package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.dpswikillm.config.RabbitConfig;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import org.junit.jupiter.api.Test;

class JobQueueAndEventTests {
    @Test
    void jobLifecycleTransitionsSetTerminalTimestamps() {
        Job job = new Job();
        job.setType(JobType.INGEST);

        job.transitionTo(JobStatus.STARTED);
        assertThat(job.getStatus()).isEqualTo(JobStatus.STARTED);

        job.transitionTo(JobStatus.COMPLETED);
        assertThat(job.getStatus()).isEqualTo(JobStatus.COMPLETED);
        assertThat(job.getUpdatedAt()).isNotNull();
    }

    @Test
    void rabbitQueuesAreDurableAndDeadLettered() {
        RabbitConfig config = new RabbitConfig();

        assertThat(config.writeQueue().isDurable()).isTrue();
        assertThat(config.answerQueue().isDurable()).isTrue();
        assertThat(config.writeQueue().getArguments()).containsEntry("x-dead-letter-exchange", RabbitConfig.DLX);
    }

    @Test
    void sseEmitterIsRegisteredOnSubscribe() {
        JobEventService service = new JobEventService();
        service.subscribe();

        assertThat(service.subscriberCount()).isEqualTo(1);
    }
}
