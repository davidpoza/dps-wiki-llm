package com.dpswikillm.services;

import com.dpswikillm.config.RabbitConfig;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
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
    private final EnrichPipelineService enrichPipelineService;
    private final ConceptMergeJobHandler conceptMergeJobHandler;
    private final KeywordRegenerationJobHandler keywordRegenerationJobHandler;
    private final RenameJobService renameJobService;
    private final HealthCheckJobHandler healthCheckJobHandler;
    private final JobRepository jobRepository;
    private final JobTokenAccounting tokenAccounting;

    public JobConsumers(
            JobLifecycleService lifecycleService,
            IngestPipelineService ingestPipelineService,
            AnswerPipelineService answerPipelineService,
            JobRevertService jobRevertService,
            EnrichPipelineService enrichPipelineService,
            ConceptMergeJobHandler conceptMergeJobHandler,
            KeywordRegenerationJobHandler keywordRegenerationJobHandler,
            RenameJobService renameJobService,
            HealthCheckJobHandler healthCheckJobHandler,
            JobRepository jobRepository,
            JobTokenAccounting tokenAccounting) {
        this.lifecycleService = lifecycleService;
        this.ingestPipelineService = ingestPipelineService;
        this.answerPipelineService = answerPipelineService;
        this.jobRevertService = jobRevertService;
        this.enrichPipelineService = enrichPipelineService;
        this.conceptMergeJobHandler = conceptMergeJobHandler;
        this.keywordRegenerationJobHandler = keywordRegenerationJobHandler;
        this.renameJobService = renameJobService;
        this.healthCheckJobHandler = healthCheckJobHandler;
        this.jobRepository = jobRepository;
        this.tokenAccounting = tokenAccounting;
    }

    /**
     * Reads the token totals accumulated on this worker thread, clears the context, and persists
     * them to the job. Runs in the consumer's finally block so it captures usage regardless of how
     * the pipeline terminated (completed, awaiting review, or failed).
     */
    private void flushTokenUsage(java.util.UUID jobId) {
        JobTokenAccounting.TokenUsage usage = tokenAccounting.snapshot();
        tokenAccounting.close();
        lifecycleService.recordTokenUsage(
                jobId, usage.promptTokens(), usage.completionTokens(), usage.totalTokens());
    }

    @RabbitListener(queues = RabbitConfig.WRITE_QUEUE)
    public void consumeWriteJob(JobMessage message) {
        if (jobRepository
                .findById(message.jobId())
                .map(j -> j.getStatus() == JobStatus.CANCELLED)
                .orElse(false)) {
            return;
        }
        tokenAccounting.open();
        try {
            lifecycleService.transition(
                    message.jobId(), JobStatus.STARTED, "started", "Write job started");
            try {
                if (message.jobType() == JobType.INGEST) {
                    ingestPipelineService.run(
                            jobRepository.findById(message.jobId()).orElseThrow());
                    return;
                }
                if (message.jobType() == JobType.REVERT) {
                    jobRevertService.revert(jobRepository.findById(message.jobId()).orElseThrow());
                    return;
                }
                if (message.jobType() == JobType.ENRICH) {
                    enrichPipelineService.run(
                            jobRepository.findById(message.jobId()).orElseThrow());
                    return;
                }
                if (message.jobType() == JobType.MERGE) {
                    conceptMergeJobHandler.run(
                            jobRepository.findById(message.jobId()).orElseThrow());
                    return;
                }
                if (message.jobType() == JobType.REGENERATE_KEYWORDS) {
                    keywordRegenerationJobHandler.run(
                            jobRepository.findById(message.jobId()).orElseThrow());
                    return;
                }
                if (message.jobType() == JobType.RENAME) {
                    renameJobService.run(jobRepository.findById(message.jobId()).orElseThrow());
                    return;
                }
                if (message.jobType() == JobType.HEALTH_CHECK) {
                    healthCheckJobHandler.run(
                            jobRepository.findById(message.jobId()).orElseThrow());
                    return;
                }
                lifecycleService.transition(
                        message.jobId(),
                        JobStatus.PROGRESS,
                        "dispatch",
                        "Write pipeline dispatch placeholder");
                lifecycleService.transition(
                        message.jobId(), JobStatus.COMPLETED, "completed", "Write job completed");
            } catch (Exception ex) {
                lifecycleService.transition(
                        message.jobId(), JobStatus.FAILED, "failed", ex.getMessage());
            }
        } finally {
            flushTokenUsage(message.jobId());
        }
    }

    @RabbitListener(queues = RabbitConfig.ANSWER_QUEUE)
    public void consumeAnswerJob(JobMessage message) {
        if (jobRepository
                .findById(message.jobId())
                .map(j -> j.getStatus() == JobStatus.CANCELLED)
                .orElse(false)) {
            return;
        }
        tokenAccounting.open();
        try {
            lifecycleService.transition(
                    message.jobId(), JobStatus.STARTED, "started", "Answer job started");
            try {
                answerPipelineService.run(jobRepository.findById(message.jobId()).orElseThrow());
            } catch (Exception ex) {
                lifecycleService.transition(
                        message.jobId(), JobStatus.FAILED, "failed", ex.getMessage());
            }
        } finally {
            flushTokenUsage(message.jobId());
        }
    }
}
