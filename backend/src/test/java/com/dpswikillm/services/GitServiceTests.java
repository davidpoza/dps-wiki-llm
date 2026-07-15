package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.config.GitProperties;
import com.dpswikillm.domain.OperationCommitRequest;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class GitServiceTests {
    @TempDir
    Path vault;

    @BeforeEach
    void initRepo() throws Exception {
        git("init");
        git("config", "user.name", "Test User");
        git("config", "user.email", "test@example.local");
        Files.writeString(vault.resolve("README.md"), "initial\n", StandardCharsets.UTF_8);
        git("add", "README.md");
        git("commit", "-m", "initial");
    }

    @Test
    void commitOperationWritesChangeLogAndReturnsRange() throws Exception {
        Files.createDirectories(vault.resolve("wiki/concepts"));
        Files.writeString(vault.resolve("wiki/concepts/demo.md"), "# Demo\n", StandardCharsets.UTF_8);

        GitService service = service();
        var result = service.commitOperation(new OperationCommitRequest(
                "mutation",
                "job-1",
                "Apply mutation",
                List.of("wiki/concepts/demo.md"),
                Map.of()));

        assertThat(result.commitSha()).isEqualTo(service.getHead().orElseThrow());
        assertThat(result.commitRange()).contains("..");
        assertThat(Files.exists(vault.resolve(result.changeLogPath()))).isTrue();
        assertThat(git("status", "--short")).isBlank();
    }

    @Test
    void resetHardRestoresHead() throws Exception {
        String initialHead = service().getHead().orElseThrow();
        Files.writeString(vault.resolve("README.md"), "changed\n", StandardCharsets.UTF_8);
        git("add", "README.md");
        git("commit", "-m", "change");

        service().resetHard(initialHead);

        assertThat(service().getHead()).contains(initialHead);
        assertThat(Files.readString(vault.resolve("README.md"))).isEqualTo("initial\n");
    }

    @Test
    void revertRangeCreatesInverseCommit() throws Exception {
        Files.writeString(vault.resolve("README.md"), "changed\n", StandardCharsets.UTF_8);
        git("add", "README.md");
        git("commit", "-m", "change");
        String changedHead = service().getHead().orElseThrow();

        service().revertRange(changedHead);

        assertThat(service().getHead().orElseThrow()).isNotEqualTo(changedHead);
        assertThat(Files.readString(vault.resolve("README.md"))).isEqualTo("initial\n");
    }

    private GitService service() {
        AppProperties properties = new AppProperties(
                vault.toString(),
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null);
        return new GitService(new VaultPathResolver(properties), new GitProperties("Test User", "test@example.local"));
    }

    private String git(String... args) throws Exception {
        Process process = new ProcessBuilder(prependGit(args))
                .directory(vault.toFile())
                .redirectErrorStream(true)
                .start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int exit = process.waitFor();
        if (exit != 0) {
            throw new IllegalStateException(output);
        }
        return output.trim();
    }

    private List<String> prependGit(String[] args) {
        java.util.ArrayList<String> command = new java.util.ArrayList<>();
        command.add("git");
        command.addAll(List.of(args));
        return command;
    }
}
