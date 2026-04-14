## Why

All scripts currently rely on ad-hoc `console.error()` / `console.log()` calls with no structured output, no severity levels, and no persistence — making it impossible to audit what happened during long-running ingestion or answer pipelines. A unified logging layer is needed to make the system observable in both local runs and production n8n deployments.

## What Changes

- Add `pino` and `pino-roll` as runtime dependencies for structured JSON logging with file rotation.
- Add logging configuration block to `tools/config.ts` (log directory path, rotation policy, log level).
- Add `tools/lib/logger.ts` — the shared logger module used by all scripts.
- Add `tools/log-tail.ts` — a standalone CLI script that n8n workflows can call to read recent log output (n8n cannot import modules directly; it calls scripts via Execute Command).
- Replace all `console.error()` / ad-hoc output in every `tools/*.ts` script with structured logger calls (`log.info`, `log.warn`, `log.error`, `log.debug`).

## Capabilities

### New Capabilities

- `structured-logging`: Pino-based structured JSON logger with daily log rotation, configurable level, and a dedicated CLI script for n8n-accessible log tailing.

### Modified Capabilities

## Impact

- **Dependencies**: adds `pino`, `pino-roll` (runtime); `@types/pino` not needed (pino ships its own types).
- **config.ts**: new `logging` section (log dir, level, rotation pattern).
- **tools/lib/logger.ts**: new shared module imported by all scripts.
- **tools/log-tail.ts**: new CLI entry point for n8n.
- **All tools/*.ts scripts**: logging calls added throughout (no interface changes, stdout JSON output unchanged — logs go to file, not stdout).
- **n8n workflows**: can optionally call `log-tail.ts` to surface recent logs in workflow output.
