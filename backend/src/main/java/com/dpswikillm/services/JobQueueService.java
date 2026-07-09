package com.dpswikillm.services;

import com.dpswikillm.config.RabbitConfig;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.dto.JobEvent;
import com.dpswikillm.dto.JobMessage;
import com.dpswikillm.repositories.JobRepository;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JobQueueService {
    private final JobRepository jobRepository;
    private final RabbitTemplate rabbitTemplate;
    private final JobEventService eventService;

    public JobQueueService(JobRepository jobRepository, RabbitTemplate rabbitTemplate, JobEventService eventService) {
        this.jobRepository = jobRepository;
        this.rabbitTemplate = rabbitTemplate;
        this.eventService = eventService;
    }

    @Transactional
    public EnqueueJobResponse enqueue(JobType type, JobMode mode, String payloadRef) {
        int position = Math.toIntExact(jobRepository.countByStatus(JobStatus.QUEUED) + 1);
        Job job = new Job();
        job.setType(type);
        job.setMode(mode == null ? JobMode.unattended : mode);
        job.setPayloadRef(payloadRef);
        job.setQueuePosition(position);
        job.transitionTo(JobStatus.QUEUED);
        Job saved = jobRepository.save(job);
        String routingKey = type == JobType.ANSWER ? RabbitConfig.ANSWER_QUEUE : RabbitConfig.WRITE_QUEUE;
        rabbitTemplate.convertAndSend(RabbitConfig.EXCHANGE, routingKey, new JobMessage(saved.getId(), saved.getType()));
        eventService.broadcast(new JobEvent(JobStatus.QUEUED, saved.getId(), saved.getType(), position,
                "queued", null, null, null, null));
        return new EnqueueJobResponse(saved.getId(), position);
    }
}
