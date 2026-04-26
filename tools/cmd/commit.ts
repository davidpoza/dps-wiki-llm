#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { parseArgs, readJsonInput, writeJsonStdout } from "../lib/infra/cli.js";
import { createLogger } from "../lib/infra/logger.js";
import { ensureDirectory, resolveVaultRoot, resolveWithinRoot, writeTextFile } from "../lib/storage/fs-utils.js";
import { SYSTEM_CONFIG } from "../config.js";
import type { CommitInput, CommitResult } from "../lib/core/contracts.js";
import { isRecord } from "../lib/core/type-guards.js";

const execFile = promisify(execFileCallback);

/**
 * Stage related vault files, write a change-log entry, and create a Git commit.
 */

/**
 * Run a Git command inside the repository root and return trimmed stdout.
 *
 * @param {string[]} args
 * @param {string} workdir
 * @param {boolean} [allowFailure=false]
 * @returns {Promise<string>}
 */
async function git(
  args: string[],
  workdir: string,
  allowFailure = false,
  extraEnv: NodeJS.ProcessEnv = {}
): Promise<string> {
  try {
    const { stdout } = await execFile("git", args, { cwd: workdir, env: { ...process.env, ...extraEnv } });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    const failure = error as { stderr?: { toString(): string }; message?: string };
    const stderr = failure.stderr?.toString?.().trim();
    throw new Error(stderr || failure.message || String(error));
  }
}

/**
 * Create a filesystem-safe timestamp used in change-log filenames.
 *
 * @returns {string}
 */
function nowStamp(): string {
  return new Date().toISOString().replaceAll(":", "-");
}

/**
 * Produce a compact slug for change-log filenames.
 *
 * @param {string} value
 * @returns {string}
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SYSTEM_CONFIG.commit.changeLogSlugMaxLength);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function normalizeCommitInput(input: unknown): CommitInput {
  if (!isRecord(input)) {
    throw new Error("Commit input must be a JSON object");
  }

  const operation =
    typeof input.operation === "string" && input.operation.trim()
      ? input.operation.trim()
      : SYSTEM_CONFIG.commit.defaultOperation;
  const summary = typeof input.summary === "string" && input.summary.trim() ? input.summary.trim() : `${operation} update`;
  const affectedNotes = stringArray(input.affected_notes);
  const sourceRefs = stringArray(input.source_refs);
  const pathsToStage = stringArray(input.paths_to_stage);

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

/**
 * Render the structured markdown change log stored under state/change-log/.
 *
 * @param {ReturnType<typeof normalizeCommitInput>} input
 * @param {string} changeLogPath
 * @returns {string}
 */
function renderChangeLog(input: CommitInput, changeLogPath: string): string {
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

/**
 * Deduplicate and compact a list of repository-relative paths.
 *
 * @param {Array<string | null>} paths
 * @returns {string[]}
 */
function uniquePaths(paths: Array<string | null>): string[] {
  return [...new Set(paths.filter((item): item is string => Boolean(item)))];
}

/**
 * Read the first non-empty environment variable from a list of names.
 *
 * @param {string[]} names
 * @returns {string}
 */
function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

/**
 * Resolve git identity from config or standard Git environment variables.
 *
 * @param {string} repoRoot
 * @returns {Promise<NodeJS.ProcessEnv>}
 */
async function resolveGitIdentityEnv(repoRoot: string): Promise<NodeJS.ProcessEnv> {
  const userName = await git(["config", "user.name"], repoRoot, true);
  const userEmail = await git(["config", "user.email"], repoRoot, true);

  if (userName && userEmail) {
    return {};
  }

  const envName = userName || readEnv("GIT_COMMITTER_NAME", "GIT_AUTHOR_NAME");
  const envEmail = userEmail || readEnv("GIT_COMMITTER_EMAIL", "GIT_AUTHOR_EMAIL");

  if (envName && envEmail) {
    return {
      GIT_AUTHOR_NAME: readEnv("GIT_AUTHOR_NAME", "GIT_COMMITTER_NAME") || envName,
      GIT_AUTHOR_EMAIL: readEnv("GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL") || envEmail,
      GIT_COMMITTER_NAME: readEnv("GIT_COMMITTER_NAME", "GIT_AUTHOR_NAME") || envName,
      GIT_COMMITTER_EMAIL: readEnv("GIT_COMMITTER_EMAIL", "GIT_AUTHOR_EMAIL") || envEmail
    };
  }

  throw new Error(
    "Git identity is required before commit.ts can create commits. Configure git user.name and user.email in the vault repo, or set GIT_AUTHOR_NAME/GIT_AUTHOR_EMAIL or GIT_COMMITTER_NAME/GIT_COMMITTER_EMAIL in the runtime environment."
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("commit");
  const input = normalizeCommitInput(await readJsonInput(args.input));
  const vaultRoot = resolveVaultRoot(args.vault);
  log.info({ operation: input.operation }, "commit started");
  const repoRoot = await git(["rev-parse", "--show-toplevel"], vaultRoot);

  const materialPaths = uniquePaths([
    ...input.paths_to_stage,
    ...input.affected_notes,
    ...input.source_refs.filter((item) => !item.startsWith(SYSTEM_CONFIG.commit.rawPathPrefix)),
    input.feedback_record_ref,
    input.mutation_result_ref
  ]);

  if (materialPaths.length === 0) {
    const result: CommitResult = {
      operation: input.operation,
      commit_created: false,
      commit_sha: null,
      change_log_path: null,
      staged_paths: []
    };
    writeJsonStdout(result, args.pretty);
    return;
  }

  await git(["add", "--", ...materialPaths], repoRoot);
  const stagedStatus = await git(["diff", "--cached", "--name-only", "--", ...materialPaths], repoRoot, true);

  if (!stagedStatus.trim()) {
    const result: CommitResult = {
      operation: input.operation,
      commit_created: false,
      commit_sha: null,
      change_log_path: null,
      staged_paths: materialPaths
    };
    writeJsonStdout(result, args.pretty);
    return;
  }

  const gitIdentityEnv = await resolveGitIdentityEnv(repoRoot);
  const changeLogRelativePath = `${SYSTEM_CONFIG.paths.changeLogDir}/${nowStamp()}-${slugify(input.operation)}.md`;
  const changeLogAbsolutePath = resolveWithinRoot(vaultRoot, changeLogRelativePath);
  await ensureDirectory(resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.changeLogDir));
  await writeTextFile(changeLogAbsolutePath, renderChangeLog(input, changeLogRelativePath));

  const pathsToStage = uniquePaths([...materialPaths, changeLogRelativePath]);
  await git(["add", "--", changeLogRelativePath], repoRoot);

  const commitMessage = input.commit_message || `${input.operation}: ${input.summary}`;
  await git(["commit", "-m", commitMessage], repoRoot, false, gitIdentityEnv);
  const commitSha = await git(["rev-parse", "--short", "HEAD"], repoRoot);

  const result: CommitResult = {
    operation: input.operation,
    commit_created: true,
    commit_sha: commitSha,
    change_log_path: changeLogRelativePath,
    staged_paths: pathsToStage
  };
  log.info({ commit_sha: commitSha, operation: input.operation }, "commit completed");
  writeJsonStdout(result, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
