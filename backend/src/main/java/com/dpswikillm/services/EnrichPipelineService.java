package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.repositories.JobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class EnrichPipelineService {
    private static final Logger log = LoggerFactory.getLogger(EnrichPipelineService.class);

    private final NoteEnrichService noteEnrichService;
    private final MarkdownService markdownService;
    private final FileService fileService;
    private final SnapshotService snapshotService;
    private final JobLifecycleService lifecycleService;
    private final JobRepository jobRepository;
    private final ObjectMapper objectMapper;

    public EnrichPipelineService(NoteEnrichService noteEnrichService,
                                 MarkdownService markdownService,
                                 FileService fileService,
                                 SnapshotService snapshotService,
                                 JobLifecycleService lifecycleService,
                                 JobRepository jobRepository,
                                 ObjectMapper objectMapper) {
        this.noteEnrichService = noteEnrichService;
        this.markdownService = markdownService;
        this.fileService = fileService;
        this.snapshotService = snapshotService;
        this.lifecycleService = lifecycleService;
        this.jobRepository = jobRepository;
        this.objectMapper = objectMapper;
    }

    public void run(Job job) throws Exception {
        String path = job.getPayloadRef();
        log.info("Job {}: enriching note at path '{}'", job.getId(), path);

        Snapshot snapshot = snapshotService.beginSnapshot(job.getId().toString(), "enrich", "Enrich note: " + path);
        PipelineTx tx = new PipelineTx();
        tx.onRollback("delete-snapshot", () -> snapshotService.deleteSnapshot(snapshot.getId()));

        try {
            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "snapshot", "Capturing current state");
            snapshotService.captureFile(snapshot, path);

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "llm", "Calling LLM");
            String content = fileService.getContent(path);
            NoteEnrichService.Result result = noteEnrichService.enrich(content);

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "apply", "Applying enrichment");
            String enriched = applyEnrichment(content, result, filename(path));
            fileService.saveContent(path, enriched);

            snapshotService.recordAfter(snapshot, path);
            snapshotService.finalizeSnapshot(snapshot, job);

            job.setAffectedPaths(toJson(List.of(path)));
            jobRepository.save(job);

            lifecycleService.fileEvent(job, path, "update");
            lifecycleService.transition(job.getId(), JobStatus.COMPLETED, "completed", "Note enriched");
            tx.clear();
        } catch (Exception ex) {
            tx.rollback();
            lifecycleService.transition(job.getId(), JobStatus.FAILED, "failed", ex.getMessage());
            throw ex;
        }
    }

    private String applyEnrichment(String content, NoteEnrichService.Result result, String fallbackTitle) {
        MarkdownDocument doc = markdownService.parse(content);

        Map<String, List<String>> sectionUpdates = new LinkedHashMap<>();
        String existingSummary = doc.sections().get("Summary");
        if (existingSummary == null || existingSummary.isBlank()) {
            sectionUpdates.put("Summary", List.of(result.summary()));
        }

        return markdownService.mergeAndRender(
                content,
                fallbackTitle,
                Map.of("keywords", result.keywords()),
                sectionUpdates.isEmpty() ? null : sectionUpdates);
    }

    private String filename(String path) {
        int idx = path.lastIndexOf('/');
        String name = idx >= 0 ? path.substring(idx + 1) : path;
        return name.endsWith(".md") ? name.substring(0, name.length() - 3) : name;
    }

    private String toJson(List<String> paths) {
        try {
            return objectMapper.writeValueAsString(paths);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to serialize affected paths", ex);
        }
    }
}
