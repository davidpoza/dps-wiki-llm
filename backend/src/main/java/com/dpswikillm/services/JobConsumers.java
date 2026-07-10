package com.dpswikillm.services;

import com.dpswikillm.config.RabbitConfig;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.dto.JobMessage;
import com.dpswikillm.repositories.JobRepository;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class JobConsumers {
    private final JobLifecycleService lifecycleService;
    private final IngestPipelineService ingestPipelineService;
    private final AnswerPipelineService answerPipelineService;
    private final JobRevertService jobRevertService;
    private final JobRepository jobRepository;

    public JobConsumers(JobLifecycleService lifecycleService, IngestPipelineService ingestPipelineService,
                        AnswerPipelineService answerPipelineService,
                        JobRevertService jobRevertService, JobRepository jobRepository) {
        this.lifecycleService = lifecycleService;
        this.ingestPipelineService = ingestPipelineService;
        this.answerPipelineService = answerPipelineService;
        this.jobRevertService = jobRevertService;
        this.jobRepository = jobRepository;
    }

    @RabbitListener(queues = RabbitConfig.WRITE_QUEUE)
    public void consumeWriteJob(JobMessage message) {
        lifecycleService.transition(message.jobId(), JobStatus.STARTED, "started", "Write job started");
        try {
            if (message.jobType() == JobType.INGEST) {
                ingestPipelineService.run(jobRepository.findById(message.jobId()).orElseThrow());
                return;
            }
            if (message.jobType() == JobType.REVERT) {
                jobRevertService.revert(jobRepository.findById(message.jobId()).orElseThrow());
                return;
            }
            lifecycleService.transition(message.jobId(), JobStatus.PROGRESS, "dispatch", "Write pipeline dispatch placeholder");
            lifecycleService.transition(message.jobId(), JobStatus.COMPLETED, "completed", "Write job completed");
        } catch (Exception ex) {
            lifecycleService.transition(message.jobId(), JobStatus.FAILED, "failed", ex.getMessage());
        }
    }

    @RabbitListener(queues = RabbitConfig.ANSWER_QUEUE)
    public void consumeAnswerJob(JobMessage message) {
        lifecycleService.transition(message.jobId(), JobStatus.STARTED, "started", "Answer job started");
        try {
            answerPipelineService.run(jobRepository.findById(message.jobId()).orElseThrow());
        } catch (Exception ex) {
            lifecycleService.transition(message.jobId(), JobStatus.FAILED, "failed", ex.getMessage());
        }
    }
}
