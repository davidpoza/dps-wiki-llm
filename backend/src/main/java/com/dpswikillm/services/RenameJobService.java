package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class RenameJobService {

    private static final Logger log = LoggerFactory.getLogger(RenameJobService.class);

    private final FileService fileService;
    private final VaultPathResolver pathResolver;
    private final JobLifecycleService lifecycleService;
    private final ObjectMapper objectMapper;

    public RenameJobService(
            FileService fileService,
            VaultPathResolver pathResolver,
            JobLifecycleService lifecycleService,
            ObjectMapper objectMapper) {
        this.fileService = fileService;
        this.pathResolver = pathResolver;
        this.lifecycleService = lifecycleService;
        this.objectMapper = objectMapper;
    }

    public void run(Job job) throws Exception {
        Map<String, String> payload =
                objectMapper.readValue(
                        job.getPayloadRef(), new TypeReference<Map<String, String>>() {});
        String oldRelPath = payload.get("path");
        String newName = payload.get("newName");

        lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "rename", "Renaming file");
        fileService.renameFile(oldRelPath, newName);

        String dir =
                oldRelPath.contains("/")
                        ? oldRelPath.substring(0, oldRelPath.lastIndexOf('/') + 1)
                        : "";
        String newRelPath = dir + newName;

        String oldFilename =
                oldRelPath.contains("/")
                        ? oldRelPath.substring(oldRelPath.lastIndexOf('/') + 1)
                        : oldRelPath;
        String oldStem = stem(oldFilename);
        String newStem = stem(newName);

        lifecycleService.transition(
                job.getId(), JobStatus.PROGRESS, "links", "Rewriting inbound links");
        int rewritten = rewriteLinks(oldRelPath, newRelPath, oldStem, newStem, job);

        lifecycleService.transition(
                job.getId(),
                JobStatus.COMPLETED,
                "completed",
                String.format("Renamed to %s; %d file(s) updated", newName, rewritten));
    }

    private String stem(String filename) {
        return filename.endsWith(".md") ? filename.substring(0, filename.length() - 3) : filename;
    }

    private int rewriteLinks(
            String oldRelPath, String newRelPath, String oldStem, String newStem, Job job) {
        Path vaultRoot = pathResolver.vaultRoot();
        int count = 0;
        try (Stream<Path> walk = Files.walk(vaultRoot)) {
            List<Path> mdFiles = walk.filter(p -> p.toString().endsWith(".md")).toList();
            for (Path file : mdFiles) {
                try {
                    String content = Files.readString(file, StandardCharsets.UTF_8);
                    String updated =
                            rewriteContent(content, oldRelPath, newRelPath, oldStem, newStem);
                    if (!updated.equals(content)) {
                        Files.writeString(file, updated, StandardCharsets.UTF_8);
                        count++;
                    }
                } catch (IOException ex) {
                    log.warn(
                            "Job {}: failed to rewrite links in {}: {}",
                            job.getId(),
                            file,
                            ex.getMessage());
                }
            }
        } catch (IOException ex) {
            log.warn(
                    "Job {}: failed to walk vault for link rewriting: {}",
                    job.getId(),
                    ex.getMessage());
        }
        return count;
    }

    private String rewriteContent(
            String content, String oldRelPath, String newRelPath, String oldStem, String newStem) {
        content = content.replace("(" + oldRelPath + ")", "(" + newRelPath + ")");
        content = content.replace("[[" + oldStem + "]]", "[[" + newStem + "]]");
        content = content.replace("[[" + oldStem + "|", "[[" + newStem + "|");
        return content;
    }
}
