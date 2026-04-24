import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

/**
 * Return the current HEAD commit SHA of the git repo at `cwd`, or null if the
 * directory is not a git repo or git is unavailable.
 */
export async function getGitHead(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Hard-reset the working tree and index of the repo at `cwd` to `sha`.
 * Throws if git is unavailable or the reset fails.
 */
export async function gitResetHard(cwd: string, sha: string): Promise<void> {
  await execFile("git", ["reset", "--hard", sha], { cwd });
}
