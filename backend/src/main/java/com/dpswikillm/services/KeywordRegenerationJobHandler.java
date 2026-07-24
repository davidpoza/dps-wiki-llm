package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.repositories.JobRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class KeywordRegenerationJobHandler {
    private static final Logger log = LoggerFactory.getLogger(KeywordRegenerationJobHandler.class);

    private final KeywordGenerationService keywordGenerationService;
    private final SnapshotService snapshotService;
    private final JobLifecycleService lifecycleService;
    private final JobRepository jobRepository;
    private final VaultPathResolver pathResolver;
    private final ObjectMapper objectMapper;

    public KeywordRegenerationJobHandler(
            KeywordGenerationService keywordGenerationService,
            SnapshotService snapshotService,
            JobLifecycleService lifecycleService,
            JobRepository jobRepository,
            VaultPathResolver pathResolver,
            ObjectMapper objectMapper) {
        this.keywordGenerationService = keywordGenerationService;
        this.snapshotService = snapshotService;
        this.lifecycleService = lifecycleService;
        this.jobRepository = jobRepository;
        this.pathResolver = pathResolver;
        this.objectMapper = objectMapper;
    }

    public void run(Job job) throws Exception {
        List<String> paths = readPaths(job.getPayloadRef());
        int total = paths.size();
        log.info("Job {}: regenerating keywords for {} note(s)", job.getId(), total);

        Snapshot snapshot =
                snapshotService.beginSnapshot(
                        job.getId().toString(),
                        "regenerate-keywords",
                        "Regenerate keywords for " + total + " note(s)");
        PipelineTx tx = new PipelineTx();
        tx.onRollback("delete-snapshot", () -> snapshotService.deleteSnapshot(snapshot.getId()));

        try {
            lifecycleService.transition(
                    job.getId(), JobStatus.PROGRESS, "snapshot", "Capturing files before update");

            List<String> updatedPaths = new ArrayList<>();
            int processed = 0;
            int updated = 0;
            int failed = 0;

            for (String path : paths) {
                try {
                    snapshotService.captureFile(snapshot, path);
                    boolean wasUpdated = keywordGenerationService.generateForPath(path, true);
                    if (wasUpdated) {
                        snapshotService.recordAfter(snapshot, path);
                        lifecycleService.fileEvent(job, path, "update");
                        updatedPaths.add(path);
                        updated++;
                    }
                } catch (Exception ex) {
                    log.warn(
                            "Job {}: keyword regeneration failed for {}: {}",
                            job.getId(),
                            path,
                            ex.getMessage());
                    failed++;
                }
                processed++;
                String msg =
                        String.format(
                                "{\"processed\":%d,\"total\":%d,\"updated\":%d,\"failed\":%d}",
                                processed, total, updated, failed);
                lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "progress", msg);
            }

            snapshotService.finalizeSnapshot(snapshot, job);
            job.setAffectedPaths(objectMapper.writeValueAsString(updatedPaths));
            jobRepository.save(job);

            String completedMsg =
                    String.format(
                            "Keywords regenerated: %d updated, %d failed out of %d",
                            updated, failed, total);
            lifecycleService.transition(
                    job.getId(), JobStatus.COMPLETED, "completed", completedMsg);
            tx.clear();
        } catch (Exception ex) {
            tx.rollback();
            lifecycleService.transition(job.getId(), JobStatus.FAILED, "failed", ex.getMessage());
            throw ex;
        }
    }

    private List<String> readPaths(String payloadRef) {
        try {
            String json =
                    java.nio.file.Files.readString(
                            pathResolver.resolve(payloadRef),
                            java.nio.charset.StandardCharsets.UTF_8);
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to read job payload: " + payloadRef, ex);
        }
    }
}
