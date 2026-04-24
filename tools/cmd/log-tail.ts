#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { SYSTEM_CONFIG } from "../config.js";

function parseArgs(argv: string[] = process.argv.slice(2)): { vault: string; lines: number } {
  let vault = process.cwd();
  let lines = 100;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--vault" && argv[i + 1]) {
      vault = argv[++i];
    } else if (argv[i] === "--lines" && argv[i + 1]) {
      lines = Number(argv[++i]);
    }
  }

  return { vault: path.resolve(vault), lines };
}

async function readLastLines(filePath: string, n: number): Promise<string[]> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  return lines.slice(-n);
}

async function findActiveLogFile(logDir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(logDir);
  } catch {
    return null;
  }

  const logFiles = entries
    .filter((name) => name.startsWith("app") && name.endsWith(".log"))
    .map((name) => path.join(logDir, name));

  if (logFiles.length === 0) {
    return null;
  }

  const withStats = await Promise.all(
    logFiles.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      return { filePath, mtime: stat.mtimeMs };
    })
  );

  withStats.sort((a, b) => b.mtime - a.mtime);
  return withStats[0].filePath;
}

async function main(): Promise<void> {
  const { vault, lines } = parseArgs();
  const logDir = SYSTEM_CONFIG.logging.dir(vault);
  const logFile = await findActiveLogFile(logDir);

  if (!logFile) {
    process.stdout.write("[]\n");
    return;
  }

  const rawLines = await readLastLines(logFile, lines);
  const parsed = rawLines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return line;
    }
  });

  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
