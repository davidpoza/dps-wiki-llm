package com.dpswikillm.services;

import com.dpswikillm.config.GitProperties;
import com.dpswikillm.domain.OperationCommitRequest;
import com.dpswikillm.domain.OperationCommitResult;
import com.dpswikillm.dto.CommitDto;
import com.dpswikillm.dto.CommitFileStatDto;
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

    public List<CommitDto> getLog(int limit) throws IOException, InterruptedException {
        ProcessResult result = git(List.of(
                "log",
                "--format=%H|%an|%ai|%s",
                "--numstat",
                "-n", String.valueOf(limit)
        ), false);
        if (result.exitCode() != 0 || result.stdout().isBlank()) {
            return List.of();
        }
        // Format: meta line, blank line, then file stat lines (no trailing blank before next meta)
        List<CommitDto> commits = new ArrayList<>();
        List<CommitFileStatDto> currentFiles = new ArrayList<>();
        String[] meta = null;
        for (String line : result.stdout().split("\n")) {
            String trimmed = line.trim();
            if (trimmed.contains("|") && trimmed.matches("[0-9a-f]{40}\\|.*")) {
                if (meta != null) {
                    commits.add(new CommitDto(meta[0], meta[1], meta[2], meta.length > 3 ? meta[3] : "", List.copyOf(currentFiles)));
                    currentFiles.clear();
                }
                meta = trimmed.split("\\|", 4);
            } else if (!trimmed.isBlank() && meta != null) {
                String[] parts = trimmed.split("\t", 3);
                if (parts.length == 3) {
                    int added = parseStatNum(parts[0]);
                    int deleted = parseStatNum(parts[1]);
                    if (added >= 0 || deleted >= 0) {
                        currentFiles.add(new CommitFileStatDto(parts[2], added, deleted));
                    }
                }
            }
        }
        if (meta != null) {
            commits.add(new CommitDto(meta[0], meta[1], meta[2], meta.length > 3 ? meta[3] : "", List.copyOf(currentFiles)));
        }
        return commits;
    }

    private int parseStatNum(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    public String getFileDiff(String sha, String path) throws IOException, InterruptedException {
        String normalized = pathResolver.normalizeRelativePath(path);
        // Use diff-tree to get the patch for this file in this commit without commit metadata
        ProcessResult result = git(List.of("diff-tree", "--no-commit-id", "-p", sha, "--", normalized), false);
        if (result.exitCode() != 0 || result.stdout().isBlank()) {
            // Fallback for root commit or renamed files: use show
            ProcessResult show = git(List.of("show", "--no-commit-id", "-p", sha, "--", normalized), false);
            return show.stdout();
        }
        return result.stdout();
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

    public void commitFileChanges(List<String> relPaths, String message) throws IOException, InterruptedException {
        List<String> addArgs = new ArrayList<>(List.of("add"));
        List<String> rmArgs = new ArrayList<>(List.of("rm", "--ignore-unmatch"));
        for (String path : relPaths) {
            String normalized = pathResolver.normalizeRelativePath(path);
            if (Files.exists(pathResolver.resolve(normalized))) {
                addArgs.add(normalized);
            } else {
                rmArgs.add(normalized);
            }
        }
        if (addArgs.size() > 1) {
            // git add returns exit code 1 when all paths are gitignored — treat as no-op
            ProcessResult addResult = git(addArgs, false);
            if (addResult.exitCode() != 0 && !addResult.stderr().contains("ignored by one of your .gitignore")) {
                requireSuccess(addResult);
            }
        }
        if (rmArgs.size() > 2) {
            requireSuccess(git(rmArgs, true));
        }
        // Only commit if there is something staged
        ProcessResult staged = git(List.of("diff", "--cached", "--quiet"), false);
        if (staged.exitCode() == 0) {
            // nothing staged — all paths were gitignored or unchanged
            return;
        }
        requireSuccess(git(List.of(
                "-c", "user.name=" + properties.userName(),
                "-c", "user.email=" + properties.userEmail(),
                "commit",
                "-m", message), true));
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
