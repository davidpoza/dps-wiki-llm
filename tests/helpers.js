import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function repoPath(...parts) {
  return path.join(repoRoot, ...parts);
}

export async function tempDir(prefix = "dps-wiki-llm-test-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeFile(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

export async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath));
}

export async function runTool(scriptName, args = [], options = {}) {
  const scriptPath = repoPath("dist", "tools", `${scriptName}.js`);
  const result = await runCommand(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd || repoRoot,
    input: options.input,
    env: options.env
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    json: parseJsonStdout(result.stdout)
  };
}

export async function runCommand(command, args = [], options = {}) {
  const ioDir = await tempDir("dps-wiki-llm-stdio-");
  const stdoutPath = path.join(ioDir, "stdout");
  const stderrPath = path.join(ioDir, "stderr");
  const stdoutFile = await fs.open(stdoutPath, "w");
  const stderrFile = await fs.open(stderrPath, "w");
  const stdinMode = typeof options.input === "string" ? "pipe" : "ignore";

  const child = spawn(command, args, {
    cwd: options.cwd || repoRoot,
    env: {
      ...process.env,
      ...options.env
    },
    stdio: [stdinMode, stdoutFile.fd, stderrFile.fd]
  });

  if (typeof options.input === "string" && child.stdin) {
    child.stdin.end(options.input);
  }

  const { code, signal } = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
  });

  await stdoutFile.close();
  await stderrFile.close();

  const stdout = await fs.readFile(stdoutPath, "utf8");
  const stderr = await fs.readFile(stderrPath, "utf8");
  await fs.rm(ioDir, { recursive: true, force: true });

  if (code !== 0) {
    const error = new Error(`Command failed: ${command} ${args.join(" ")}\n${stderr || stdout}`);
    error.code = code;
    error.signal = signal;
    error.stdout = stdout;
    error.stderr = stderr;
    throw error;
  }

  return { stdout, stderr };
}

export function parseJsonStdout(stdout) {
  assert.ok(stdout.trim(), "expected stdout to contain JSON");
  return JSON.parse(stdout);
}

export function conceptNote(title, body, frontmatter = {}) {
  const fm = {
    type: "concept",
    title,
    updated: "2026-04-11",
    ...frontmatter
  };

  return `---\n${Object.entries(fm)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n---\n\n# ${title}\n\n${body.trim()}\n`;
}

export function sourceNote(title, body, sourceRef = "raw/inbox/source.md") {
  return `---\ntype: "source"\ntitle: ${JSON.stringify(title)}\nsource_kind: "note"\nsource_ref: ${JSON.stringify(sourceRef)}\ncaptured_at: "2026-04-11T00:00:00Z"\nupdated: "2026-04-11"\n---\n\n# ${title}\n\n${body.trim()}\n`;
}
