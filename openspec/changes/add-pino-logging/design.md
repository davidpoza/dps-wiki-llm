## Context

All scripts in `tools/*.ts` run as CLI subprocesses — invoked directly or via n8n Execute Command nodes. They write JSON results to stdout and errors to stderr via bare `console.error()`. There is no log file, no severity levels, and no way to correlate events across the pipeline stages of a single run. In production (Docker + n8n), transient errors are silently lost unless n8n captures stderr.

The project has no runtime dependencies today (`package.json` has only devDependencies). Adding pino introduces the first runtime dependency, so the choice must be justified and minimal.

## Goals / Non-Goals

**Goals:**
- Structured JSON log lines (timestamp, level, script name, message, context fields).
- Log rotation by size or time so disk usage is bounded in production.
- Zero change to stdout — all existing JSON output to stdout stays intact; logs go to a rotating file only.
- A single `tools/lib/logger.ts` module that every script imports; no per-script configuration.
- A `tools/log-tail.ts` CLI script n8n can call to read recent log lines as JSON.
- Log level and paths configurable via `tools/config.ts`.

**Non-Goals:**
- Remote log shipping (ELK, Loki, Datadog, etc.).
- Per-script log files — a single shared log file keeps things simple.
- Changing stdout/stderr contract for any existing script.
- Structured tracing or span correlation across processes.

## Decisions

### D1 — Use `pino` + `pino-roll` instead of alternatives

**Choice:** `pino` for structured JSON logging, `pino-roll` for file rotation.

**Rationale:**
- Pino is the fastest Node.js logger and ships its own TypeScript types — no `@types/*` package needed.
- `pino-roll` is the official pino-ecosystem rotation transport; it supports size-based and time-based rotation and is a single small dependency.
- Alternatives considered:
  - `winston` — heavier, more complex, requires separate transport packages.
  - `bunyan` — unmaintained.
  - Node.js built-in streams + manual rotation — significant boilerplate for no meaningful gain.

### D2 — Logger factory: one logger instance per script, named by script

**Choice:** `createLogger(name: string)` factory in `tools/lib/logger.ts` that returns a child logger with a `script` field.

**Rationale:** Every log line will include the originating script name without repetition in call sites. Callers just do `const log = createLogger('ingest-run')` at the top of their file.

### D3 — Log destination: file only, no pino-pretty in production

**Choice:** In all environments, logs go to a rotating file at `{vault}/state/logs/app.log`. No pretty-printing to stderr/stdout.

**Rationale:** Scripts run inside n8n which captures stderr. Mixing pretty-printed logs with JSON stdout would break n8n's output parsing. File-only keeps stdout clean. Developers can `tail -f` the log file locally.

**Alternative considered:** Use `pino-pretty` when `NODE_ENV=development`. Rejected because it adds complexity and developers can simply `tail -f state/logs/app.log | jq`.

### D4 — Config lives in `tools/config.ts` under a `logging` key

**Choice:** Add a `logging` object to the existing config with `dir`, `level`, `maxSize`, and `frequency` fields.

**Rationale:** All other config (paths, DB pragmas, etc.) lives in config.ts — logging config belongs there too for consistency. The `dir` is derived from vault root (already a config pattern).

### D5 — n8n access via `tools/log-tail.ts` CLI script

**Choice:** A dedicated script that reads the last N lines from the log file and writes them as a JSON array to stdout.

**Rationale:** n8n workflows invoke scripts via Execute Command. They cannot `import` TypeScript modules. A CLI script bridges this gap. N8n can call `node /app/dist/tools/log-tail.js --vault /data/vault --lines 100` and parse the JSON output.

## Risks / Trade-offs

- **First runtime dependency** → Mitigation: pino is well-maintained, widely used, and has no transitive dependencies that introduce risk. Lock version in package.json.
- **Log file grows on disk if rotation misconfigured** → Mitigation: `pino-roll` defaults will be set conservatively (10 MB max size, keep last 7 files); these are surfaced in config.ts so operators can tune them.
- **Adding logger calls to every script is broad** → Mitigation: the logger module is simple; changes are mechanical. Each script gets an `info` at start/end and `error` in catch blocks as a minimum.

## Migration Plan

1. `npm install pino pino-roll` — adds runtime deps.
2. Add `logging` config block to `tools/config.ts`.
3. Create `tools/lib/logger.ts`.
4. Create `tools/log-tail.ts`.
5. Update each `tools/*.ts` script to import and use the logger.
6. Rebuild with `npm run build`.
7. No rollback complexity — if logging breaks, scripts continue to work (logging errors are non-fatal by design).
