package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.dto.SyncResultDto;
import com.dpswikillm.repositories.JobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Runs a WebDAV manual sync as a background job. Progress is reported through the global job event
 * stream (step {@code sync-scan}), the local mutations (pulls + local deletions) are recorded on the
 * job so it becomes revertible via {@link JobRevertService}, and the summary is stored in the
 * completion message.
 */
@Service
public class SyncJobHandler {
    private static final Logger log = LoggerFactory.getLogger(SyncJobHandler.class);

    private final WebDavSyncService webDavSyncService;
    private final JobLifecycleService lifecycleService;
    private final JobRepository jobRepository;
    private final ObjectMapper objectMapper;

    public SyncJobHandler(
            WebDavSyncService webDavSyncService,
            JobLifecycleService lifecycleService,
            JobRepository jobRepository,
            ObjectMapper objectMapper) {
        this.webDavSyncService = webDavSyncService;
        this.lifecycleService = lifecycleService;
        this.jobRepository = jobRepository;
        this.objectMapper = objectMapper;
    }

    public void run(Job job) throws Exception {
        lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "started", "Sync started");

        SyncResultDto result;
        try {
            result =
                    webDavSyncService.sync(
                            progress ->
                                    lifecycleService.progress(
                                            job,
                                            "sync-scan",
                                            progress.path(),
                                            String.format(
                                                    "{\"current\":%d,\"total\":%d}",
                                                    progress.processed(), progress.total())),
                            job);
        } catch (WebDavNotConfiguredException ex) {
            lifecycleService.transition(
                    job.getId(), JobStatus.FAILED, "failed", "WebDAV not configured");
            return;
        }

        // Affected local paths are the union of pulled + deleted (pushes mutate the remote, not the
        // local vault, so they are excluded from revert scope). Persist them on the job for revert
        // conflict detection and history, and emit file events so the jobs panel shows the changes
        // and the revert action can be gated on their presence.
        Set<String> localPaths = new LinkedHashSet<>();
        localPaths.addAll(result.pulled());
        localPaths.addAll(result.deleted());

        Job persisted = jobRepository.findById(job.getId()).orElse(job);
        persisted.setAffectedPaths(objectMapper.writeValueAsString(List.copyOf(localPaths)));
        jobRepository.save(persisted);

        for (String path : result.pulled()) {
            lifecycleService.fileEvent(persisted, path, "modified");
        }
        for (String path : result.deleted()) {
            lifecycleService.fileEvent(persisted, path, "delete");
        }

        String completedMsg =
                String.format(
                        "Sync completado: %d pulled, %d pushed, %d deleted, %d conflicts",
                        result.pulled().size(),
                        result.pushed().size(),
                        result.deleted().size(),
                        result.conflicts().size());
        log.info("Job {}: {}", job.getId(), completedMsg);
        lifecycleService.transition(job.getId(), JobStatus.COMPLETED, "completed", completedMsg);
    }
}
