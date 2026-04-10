#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.mjs";
import { ensureDirectory, resolveVaultRoot, resolveWithinRoot, writeTextFile } from "./lib/fs-utils.mjs";

const execFile = promisify(execFileCallback);

async function git(args, workdir, allowFailure = false) {
  try {
    const { stdout } = await execFile("git", args, { cwd: workdir });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    const stderr = error?.stderr?.toString?.().trim();
    throw new Error(stderr || error.message);
  }
}

function nowStamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeCommitInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Commit input must be a JSON object");
  }

  const operation = typeof input.operation === "string" && input.operation.trim() ? input.operation.trim() : "manual";
  const summary = typeof input.summary === "string" && input.summary.trim() ? input.summary.trim() : `${operation} update`;
  const affectedNotes = Array.isArray(input.affected_notes) ? input.affected_notes.filter(Boolean) : [];
  const sourceRefs = Array.isArray(input.source_refs) ? input.source_refs.filter(Boolean) : [];
  const pathsToStage = Array.isArray(input.paths_to_stage) ? input.paths_to_stage.filter(Boolean) : [];

  return {
    operation,
    summary,
    source_refs: sourceRefs,
    affected_notes: affectedNotes,
    paths_to_stage: pathsToStage,
    feedback_record_ref:
      typeof input.feedback_record_ref === "string" && input.feedback_record_ref.trim()
        ? input.feedback_record_ref.trim()
        : null,
    mutation_result_ref:
      typeof input.mutation_result_ref === "string" && input.mutation_result_ref.trim()
        ? input.mutation_result_ref.trim()
        : null,
    commit_message:
      typeof input.commit_message === "string" && input.commit_message.trim() ? input.commit_message.trim() : null
  };
}

function renderChangeLog(input, changeLogPath) {
  const lines = [
    "---",
    'type: "change_log"',
    `timestamp: "${new Date().toISOString()}"`,
    `operation: "${input.operation}"`,
    "---",
    "",
    `# ${input.summary}`,
    "",
    "## Summary",
    input.summary,
    ""
  ];

  if (input.source_refs.length > 0) {
    lines.push("## Source Refs");
    for (const item of input.source_refs) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (input.affected_notes.length > 0) {
    lines.push("## Affected Notes");
    for (const item of input.affected_notes) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  lines.push("## Artifacts");
  lines.push(`- change_log: ${changeLogPath}`);
  if (input.feedback_record_ref) {
    lines.push(`- feedback_record: ${input.feedback_record_ref}`);
  }
  if (input.mutation_result_ref) {
    lines.push(`- mutation_result: ${input.mutation_result_ref}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

async function ensureGitIdentity(repoRoot) {
  const userName = await git(["config", "user.name"], repoRoot, true);
  const userEmail = await git(["config", "user.email"], repoRoot, true);

  if (!userName || !userEmail) {
    throw new Error("Git user.name and user.email must be configured before commit.mjs can create commits");
  }
}

async function main() {
  const args = parseArgs();
  const input = normalizeCommitInput(await readJsonInput(args.input));
  const vaultRoot = resolveVaultRoot(args.vault);
  const repoRoot = await git(["rev-parse", "--show-toplevel"], vaultRoot);
  await ensureGitIdentity(repoRoot);

  const materialPaths = uniquePaths([
    ...input.paths_to_stage,
    ...input.affected_notes,
    ...input.source_refs.filter((item) => !item.startsWith("raw/")),
    input.feedback_record_ref,
    input.mutation_result_ref
  ]);

  if (materialPaths.length === 0) {
    writeJsonStdout(
      {
        operation: input.operation,
        commit_created: false,
        commit_sha: null,
        change_log_path: null,
        staged_paths: []
      },
      args.pretty
    );
    return;
  }

  await git(["add", "--", ...materialPaths], repoRoot);
  const stagedStatus = await git(["diff", "--cached", "--name-only", "--", ...materialPaths], repoRoot, true);

  if (!stagedStatus.trim()) {
    writeJsonStdout(
      {
        operation: input.operation,
        commit_created: false,
        commit_sha: null,
        change_log_path: null,
        staged_paths: materialPaths
      },
      args.pretty
    );
    return;
  }

  const changeLogRelativePath = `state/change-log/${nowStamp()}-${slugify(input.operation)}.md`;
  const changeLogAbsolutePath = resolveWithinRoot(vaultRoot, changeLogRelativePath);
  await ensureDirectory(resolveWithinRoot(vaultRoot, "state/change-log"));
  await writeTextFile(changeLogAbsolutePath, renderChangeLog(input, changeLogRelativePath));

  const pathsToStage = uniquePaths([...materialPaths, changeLogRelativePath]);
  await git(["add", "--", changeLogRelativePath], repoRoot);

  const commitMessage = input.commit_message || `${input.operation}: ${input.summary}`;
  await git(["commit", "-m", commitMessage], repoRoot);
  const commitSha = await git(["rev-parse", "--short", "HEAD"], repoRoot);

  writeJsonStdout(
    {
      operation: input.operation,
      commit_created: true,
      commit_sha: commitSha,
      change_log_path: changeLogRelativePath,
      staged_paths: pathsToStage
    },
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
