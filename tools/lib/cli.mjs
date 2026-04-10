import fs from "node:fs/promises";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    _: [],
    vault: process.cwd(),
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

export async function readJsonInput(inputPath) {
  if (inputPath) {
    return JSON.parse(await fs.readFile(inputPath, "utf8"));
  }

  if (!process.stdin.isTTY) {
    const raw = await readStdin();
    if (raw.trim()) {
      return JSON.parse(raw);
    }
  }

  throw new Error("Expected JSON input via --input <file> or stdin");
}

export function writeJsonStdout(value, pretty = true) {
  const indent = pretty ? 2 : 0;
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  return chunks.join("");
}
