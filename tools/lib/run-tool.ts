import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

type RunToolOptions = {
  vault?: string;
  input?: unknown;
  args?: string[];
  write?: boolean;
};

function toolScriptPath(scriptName: string): string {
  return fileURLToPath(new URL(`../${scriptName}.js`, import.meta.url));
}

async function writeTempInput(input: unknown): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dps-wiki-llm-tool-"));
  const file = path.join(dir, "input.json");
  await fs.writeFile(file, `${JSON.stringify(input)}\n`, "utf8");
  return { dir, file };
}

export async function runToolJson<T = unknown>(scriptName: string, options: RunToolOptions = {}): Promise<T> {
  let tempDir: string | null = null;
  const args = [...(options.args ?? [])];

  if (options.vault) {
    args.push("--vault", options.vault);
  }

  if (options.input !== undefined) {
    const temp = await writeTempInput(options.input);
    tempDir = temp.dir;
    args.push("--input", temp.file);
  }

  if (options.write === false) {
    args.push("--no-write");
  }

  args.push("--compact");

  try {
    const { stdout } = await execFile(process.execPath, [toolScriptPath(scriptName), ...args], {
      env: process.env,
      maxBuffer: 1024 * 1024 * 50
    });
    const text = stdout.trim();
    if (!text) {
      throw new Error(`${scriptName} returned empty stdout`);
    }
    return JSON.parse(text) as T;
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; message?: string };
    const detail = failure.stderr?.trim() || failure.stdout?.trim() || failure.message || String(error);
    throw new Error(`${scriptName} failed: ${detail}`);
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
