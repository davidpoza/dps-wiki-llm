package com.dpswikillm.controllers;

import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.services.JobQueueService;
import com.dpswikillm.services.VaultPathResolver;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class KeywordRegenerationController {

    record RegenerateRequest(@NotEmpty List<String> paths) {}

    private final JobQueueService queueService;
    private final VaultPathResolver pathResolver;
    private final ObjectMapper objectMapper;

    public KeywordRegenerationController(
            JobQueueService queueService,
            VaultPathResolver pathResolver,
            ObjectMapper objectMapper) {
        this.queueService = queueService;
        this.pathResolver = pathResolver;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/keywords/regenerate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EnqueueJobResponse regenerate(@Valid @RequestBody RegenerateRequest request)
            throws IOException {
        String payloadPath = "raw/keywords/" + UUID.randomUUID() + ".json";
        Path abs = pathResolver.resolve(payloadPath);
        Files.createDirectories(abs.getParent());
        Files.writeString(
                abs, objectMapper.writeValueAsString(request.paths()), StandardCharsets.UTF_8);
        return queueService.enqueue(JobType.REGENERATE_KEYWORDS, JobMode.unattended, payloadPath);
    }
}
