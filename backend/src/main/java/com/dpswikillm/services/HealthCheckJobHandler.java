package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.MutationResult;
import com.dpswikillm.domain.Snapshot;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class HealthCheckJobHandler {
    private static final Logger log = LoggerFactory.getLogger(HealthCheckJobHandler.class);

    private final HealthCheckService healthCheckService;
    private final SnapshotService snapshotService;
    private final JobLifecycleService lifecycleService;
    private final VaultPathResolver pathResolver;
    private final ObjectMapper objectMapper;

    public HealthCheckJobHandler(
            HealthCheckService healthCheckService,
            SnapshotService snapshotService,
            JobLifecycleService lifecycleService,
            VaultPathResolver pathResolver,
            ObjectMapper objectMapper) {
        this.healthCheckService = healthCheckService;
        this.snapshotService = snapshotService;
        this.lifecycleService = lifecycleService;
        this.pathResolver = pathResolver;
        this.objectMapper = objectMapper;
    }

    public void run(Job job) throws Exception {
        Set<String> pathFilter = readPathFilter(job.getPayloadRef());
        log.info(
                "Job {}: running health check, pathFilter size={}", job.getId(), pathFilter.size());

        lifecycleService.transition(
                job.getId(), JobStatus.PROGRESS, "started", "Health check started");

        HealthCheckService.DiscoverResult discovered =
                healthCheckService.discover(
                        pathFilter,
                        progress -> {
                            String resultJson =
                                    String.format(
                                            "{\"processed\":%d,\"total\":%d,\"embeddingsBuilt\":%d,\"connectionsFound\":%d}",
                                            progress.processed(),
                                            progress.total(),
                                            progress.embeddingsBuilt(),
                                            progress.connectionsFound());
                            lifecycleService.progress(job, progress.phase(), null, resultJson);
                        });

        if (!discovered.computed().isEmpty()) {
            Snapshot snapshot =
                    snapshotService.beginSnapshot(
                            job.getId().toString(), "health-check", "Health Check", "HEALTH_CHECK");
            try {
                MutationResult mutationResult =
                        healthCheckService.applyConnections(
                                discovered.computed(), discovered.backlinkOnlyPaths(), snapshot);
                for (String path : mutationResult.created()) {
                    snapshotService.recordAfter(snapshot, path);
                }
                for (String path : mutationResult.updated()) {
                    snapshotService.recordAfter(snapshot, path);
                }
                snapshotService.recordAfter(snapshot, HealthCheckService.IDEMPOTENCY_LEDGER);
                snapshotService.finalizeSnapshot(snapshot, job);
            } catch (Exception ex) {
                try {
                    snapshotService.deleteSnapshot(snapshot.getId());
                } catch (RuntimeException cleanupEx) {
                    log.warn(
                            "Failed to clean up health-check snapshot {}: {}",
                            snapshot.getId(),
                            cleanupEx.getMessage());
                }
                throw ex;
            }
        }

        String completedMsg =
                String.format(
                        "Health check complete: %d embeddings built, %d connections found",
                        discovered.embeddingsBuilt(), discovered.connectionsFound());
        lifecycleService.transition(job.getId(), JobStatus.COMPLETED, "completed", completedMsg);
    }

    private Set<String> readPathFilter(String payloadRef) {
        if (payloadRef == null) {
            return Set.of();
        }
        try {
            String json =
                    java.nio.file.Files.readString(
                            pathResolver.resolve(payloadRef),
                            java.nio.charset.StandardCharsets.UTF_8);
            List<String> paths = objectMapper.readValue(json, new TypeReference<List<String>>() {});
            return Set.copyOf(paths);
        } catch (Exception ex) {
            throw new IllegalStateException(
                    "Failed to read health check payload: " + payloadRef, ex);
        }
    }
}
