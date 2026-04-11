import fs from "node:fs/promises";

import { SYSTEM_CONFIG } from "../config.js";
import type { CliArgs } from "./contracts.js";

/**
 * Shared CLI helpers for the repository's JSON-first Node.js scripts.
 */

/**
 * Parse the common command-line flags used by the toolchain.
 *
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {{
 *   _: string[],
 *   vault: string,
 *   input: string | null,
 *   db: string | null,
 *   limit: number | null,
 *   write: boolean,
 *   pretty: boolean
 * }}
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {
    _: [],
    vault: SYSTEM_CONFIG.cli.defaultVault(),
    input: null,
    db: null,
    limit: null,
    write: true,
    pretty: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--vault") {
      args.vault = argv[++index];
      continue;
    }

    if (token === "--input") {
      args.input = argv[++index];
      continue;
    }

    if (token === "--db") {
      args.db = argv[++index];
      continue;
    }

    if (token === "--limit") {
      args.limit = Number(argv[++index]);
      continue;
    }

    if (token === "--no-write") {
      args.write = false;
      continue;
    }

    if (token === "--write") {
      args.write = true;
      continue;
    }

    if (token === "--compact") {
      args.pretty = false;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }

    args._.push(token);
  }

  if (!args.input && args._.length > 0) {
    args.input = args._[0];
  }

  return args;
}

/**
 * Read JSON input from a file path or from stdin when available.
 *
 * @param {string | null} inputPath
 * @returns {Promise<any>}
 */
export async function readJsonInput<T = unknown>(inputPath: string | null): Promise<T> {
  if (inputPath) {
    return JSON.parse(await fs.readFile(inputPath, "utf8")) as T;
  }

  if (!process.stdin.isTTY) {
    const raw = await readStdin();
    if (raw.trim()) {
      return JSON.parse(raw) as T;
    }
  }

  throw new Error("Expected JSON input via --input <file> or stdin");
}

/**
 * Emit machine-readable JSON to stdout with optional pretty printing.
 *
 * @param {unknown} value
 * @param {boolean} [pretty=true]
 */
export function writeJsonStdout(value: unknown, pretty: boolean = SYSTEM_CONFIG.cli.prettyJson): void {
  const indent = pretty ? 2 : 0;
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
}

/**
 * Buffer stdin and return it as a UTF-8 string.
 *
 * @returns {Promise<string>}
 */
async function readStdin(): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  return chunks.join("");
}
