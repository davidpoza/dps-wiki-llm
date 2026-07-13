package com.dpswikillm.services;

import com.dpswikillm.domain.AnswerRecord;
import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.SearchResult;
import com.dpswikillm.dto.ChatMessage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class AnswerPipelineService {
    private static final int TOP_K = 5;
    private static final int MAX_CONTEXT_CHARS = 12_000;

    private final SemanticSearchService semanticSearch;
    private final LlmClient llmClient;
    private final VaultPathResolver pathResolver;
    private final JobLifecycleService lifecycleService;
    private final PromptService promptService;

    public AnswerPipelineService(SemanticSearchService semanticSearch, LlmClient llmClient,
                                 VaultPathResolver pathResolver, JobLifecycleService lifecycleService,
                                 PromptService promptService) {
        this.semanticSearch = semanticSearch;
        this.llmClient = llmClient;
        this.pathResolver = pathResolver;
        this.lifecycleService = lifecycleService;
        this.promptService = promptService;
    }

    public AnswerRecord run(Job job) throws IOException {
        String question = job.getPayloadRef();
        String artifactPath = null;
        try {
            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "retrieval", "Running semantic retrieval");
            List<SearchResult> hits = semanticSearch.search(question, TOP_K);
            List<String> evidencePaths = hits.stream().map(SearchResult::path).toList();

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "context-build", "Building context packet");
            String contextPacket = buildContext(hits);

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "synthesis", "Synthesizing answer with LLM");
            String answer = llmClient.chat(List.of(
                    new ChatMessage("system", promptService.getText("answer-system")),
                    new ChatMessage("user", "Question: " + question + "\n\nContext:\n" + contextPacket)));

            lifecycleService.transition(job.getId(), JobStatus.PROGRESS, "record", "Writing answer artifact");
            artifactPath = writeArtifact(job, question, answer, evidencePaths);

            AnswerRecord record = new AnswerRecord(question, answer, evidencePaths, artifactPath, true);
            lifecycleService.transition(job.getId(), JobStatus.COMPLETED, "completed",
                    "Answer written to " + artifactPath);
            return record;
        } catch (Exception ex) {
            cleanupArtifact(artifactPath);
            throw ex;
        }
    }

    void cleanupArtifact(String artifactPath) {
        if (artifactPath == null) {
            return;
        }
        try {
            Files.deleteIfExists(pathResolver.resolve(artifactPath));
        } catch (IOException ignored) {}
    }

    private String buildContext(List<SearchResult> hits) {
        StringBuilder sb = new StringBuilder();
        for (SearchResult hit : hits) {
            String body = hit.body() != null ? hit.body() : "";
            String header = "### " + hit.path() + "\n";
            if (sb.length() + header.length() + body.length() > MAX_CONTEXT_CHARS) {
                int remaining = MAX_CONTEXT_CHARS - sb.length() - header.length();
                if (remaining > 0) {
                    sb.append(header).append(body, 0, remaining);
                }
                break;
            }
            sb.append(header).append(body).append("\n\n");
        }
        return sb.toString();
    }

    private String writeArtifact(Job job, String question, String answer, List<String> evidence) throws IOException {
        String relPath = "outputs/answer-" + job.getId() + ".md";
        Path file = pathResolver.resolve(relPath);
        Files.createDirectories(file.getParent());
        String evidenceSection = evidence.isEmpty()
                ? "_No evidence documents retrieved._"
                : evidence.stream().map(p -> "- [[" + p + "]]").collect(Collectors.joining("\n"));
        String content = "# Answer\n\n**Question:** " + question + "\n\n## Response\n\n" + answer +
                "\n\n## Evidence\n\n" + evidenceSection + "\n";
        Files.writeString(file, content, StandardCharsets.UTF_8);
        return relPath;
    }
}
