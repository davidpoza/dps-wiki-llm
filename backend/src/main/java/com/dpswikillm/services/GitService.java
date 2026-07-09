package com.dpswikillm.services;

import com.dpswikillm.config.GitProperties;
import com.dpswikillm.domain.OperationCommitRequest;
import com.dpswikillm.domain.OperationCommitResult;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class GitService {
    private static final DateTimeFormatter CHANGELOG_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final VaultPathResolver pathResolver;
    private final GitProperties properties;

    public GitService(VaultPathResolver pathResolver, GitProperties properties) {
        this.pathResolver = pathResolver;
        this.properties = properties;
    }

    public Optional<String> getHead() throws IOException, InterruptedException {
        ProcessResult result = git(List.of("rev-parse", "HEAD"), false);
        if (result.exitCode() != 0) {
            return Optional.empty();
        }
        return Optional.of(result.stdout().trim());
    }

    public void resetHard(String sha) throws IOException, InterruptedException {
        requireSuccess(git(List.of("reset", "--hard", sha), true));
        requireSuccess(git(List.of("clean", "-fd"), true));
    }

    public void revertRange(String commitRange) throws IOException, InterruptedException {
        List<String> args = new ArrayList<>();
        args.add("revert");
        args.add("--no-edit");
        args.addAll(parseCommitRanges(commitRange));
        requireSuccess(git(args, true));
    }

    public void revertRangeNoCommit(String commitRange) throws IOException, InterruptedException {
        List<String> args = new ArrayList<>();
        args.add("revert");
        args.add("--no-commit");
        args.addAll(parseCommitRanges(commitRange));
        requireSuccess(git(args, true));
    }

    public List<String> changedPaths() throws IOException, InterruptedException {
        ProcessResult result = git(List.of("diff", "--name-only", "HEAD"), true);
        if (result.stdout().isBlank()) {
            return List.of();
        }
        return result.stdout().lines()
                .map(String::trim)
                .filter(path -> !path.isBlank())
                .toList();
    }

    public OperationCommitResult commitOperation(OperationCommitRequest request) throws IOException, InterruptedException {
        String before = getHead().orElse(null);
        String changeLogPath = writeChangeLog(request);

        List<String> addArgs = new ArrayList<>();
        addArgs.add("add");
        addArgs.add("-A");
        addArgs.add(changeLogPath);
        List<String> rmArgs = new ArrayList<>();
        rmArgs.add("rm");
        rmArgs.add("--ignore-unmatch");
        for (String path : request.affectedPaths()) {
            String normalized = pathResolver.normalizeRelativePath(path);
            if (Files.exists(pathResolver.resolve(normalized))) {
                addArgs.add(normalized);
            } else {
                rmArgs.add(normalized);
            }
        }
        requireSuccess(git(addArgs, true));
        if (rmArgs.size() > 2) {
            requireSuccess(git(rmArgs, true));
        }

        requireSuccess(git(List.of(
                "-c", "user.name=" + properties.userName(),
                "-c", "user.email=" + properties.userEmail(),
                "commit",
                "-m", request.message()), true));

        String after = getHead().orElseThrow(() -> new IllegalStateException("Commit did not produce HEAD"));
        String range = before == null ? after : before + ".." + after;
        return new OperationCommitResult(after, range, changeLogPath);
    }

    private String writeChangeLog(OperationCommitRequest request) throws IOException {
        String stamp = CHANGELOG_FORMAT.format(Instant.now());
        String safeType = request.operationType().replaceAll("[^A-Za-z0-9._-]+", "-").toLowerCase();
        String relativePath = "state/change-log/" + stamp + "-" + safeType + ".md";
        Path absolutePath = pathResolver.resolve(relativePath);
        Files.createDirectories(absolutePath.getParent());

        StringBuilder body = new StringBuilder();
        body.append("---\n");
        body.append("type: operation\n");
        body.append("operation_type: ").append(request.operationType()).append("\n");
        if (request.jobId() != null && !request.jobId().isBlank()) {
            body.append("job_id: ").append(request.jobId()).append("\n");
        }
        body.append("created_at: ").append(Instant.now()).append("\n");
        body.append("---\n\n");
        body.append("# Operation: ").append(request.operationType()).append("\n\n");
        body.append("## Summary\n");
        body.append(request.message()).append("\n\n");
        body.append("## Affected Paths\n");
        for (String path : request.affectedPaths()) {
            body.append("- ").append(pathResolver.normalizeRelativePath(path)).append("\n");
        }
        Files.writeString(absolutePath, body.toString(), StandardCharsets.UTF_8);
        return relativePath;
    }

    private ProcessResult git(List<String> args, boolean failOnStartError) throws IOException, InterruptedException {
        List<String> command = new ArrayList<>();
        command.add("git");
        command.addAll(args);
        Process process = new ProcessBuilder(command)
                .directory(pathResolver.vaultRoot().toFile())
                .redirectErrorStream(false)
                .start();
        String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
        int exitCode = process.waitFor();
        ProcessResult result = new ProcessResult(exitCode, stdout, stderr);
        if (failOnStartError && exitCode != 0) {
            requireSuccess(result);
        }
        return result;
    }

    private void requireSuccess(ProcessResult result) {
        if (result.exitCode() != 0) {
            throw new IllegalStateException("git failed: " + result.stderr());
        }
    }

    private List<String> parseCommitRanges(String commitRange) {
        if (commitRange == null || commitRange.isBlank()) {
            throw new IllegalArgumentException("Commit range is required");
        }
        return List.of(commitRange.split(",")).stream()
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
    }

    private record ProcessResult(int exitCode, String stdout, String stderr) {}
}
