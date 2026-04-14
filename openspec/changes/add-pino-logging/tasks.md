## 1. Dependencies and Configuration

- [x] 1.1 Install `pino` and `pino-roll` as runtime dependencies via `npm install pino pino-roll`
- [x] 1.2 Add `logging` config block to `tools/config.ts` with `dir(vaultRoot)`, `level`, `maxSize`, and `frequency` fields
- [x] 1.3 Update docker images with mentioned dependencies

## 2. Logger Module

- [x] 2.1 Create `tools/lib/logger.ts` with `createLogger(name: string)` factory that returns a pino child logger writing to the rotating file at `{vault}/state/logs/app.log`
- [x] 2.2 Ensure logger reads level, maxSize, and frequency from `tools/config.ts`
- [x] 2.3 Ensure log directory is created if it does not exist before the transport opens the file

## 3. log-tail Script

- [x] 3.1 Create `tools/log-tail.ts` that accepts `--vault <path>` and `--lines <n>` (default 100) arguments
- [x] 3.2 Read last N lines from `{vault}/state/logs/app.log` and write a JSON array to stdout
- [x] 3.3 Return empty JSON array `[]` and exit 0 if log file does not exist

## 4. Update Core Pipeline Scripts

- [x] 4.1 Update `tools/ingest-run.ts` — add logger, emit start/end/error events and per-stage info logs
- [x] 4.2 Update `tools/answer-run.ts` — add logger, emit start/end/error events and per-stage info logs
- [x] 4.3 Update `tools/ingest-source.ts` — add logger, emit start/end/error events
- [x] 4.4 Update `tools/apply-update.ts` — add logger, emit mutation plan events and error logging

## 5. Update Supporting Scripts

- [x] 5.1 Update `tools/init-db.ts` — add logger, emit schema creation events
- [x] 5.2 Update `tools/reindex.ts` — add logger, emit reindex progress and completion
- [x] 5.3 Update `tools/youtube-transcript.ts` — add logger, emit fetch start/end/error
- [x] 5.4 Update `tools/plan-source-note.ts` — add logger, emit plan creation events
- [x] 5.5 Update `tools/answer-context.ts` — add logger, emit context build events
- [x] 5.6 Update `tools/answer-record.ts` — add logger, emit record persistence events
- [x] 5.7 Update `tools/feedback-record.ts` — add logger, emit feedback record events

## 6. Update Maintenance and Utility Scripts

- [x] 6.1 Update `tools/lint.ts` — add logger, emit validation start/end and issue counts
- [x] 6.2 Update `tools/health-check.ts` — add logger, emit check start/end and summary
- [x] 6.3 Update `tools/commit.ts` — add logger, emit commit start/end/error
- [x] 6.4 Update `tools/search.ts` — add logger, emit query and result count
- [x] 6.5 Update `tools/bot-lock.ts` — add logger, emit lock acquire/release events
- [x] 6.6 Update `tools/render-n8n-workflows.ts` — add logger, emit render start/end

## 7. Build and Verify

- [x] 7.1 Run `npm run build` and confirm no TypeScript errors
- [x] 7.2 Smoke-test `tools/log-tail.ts` — call with `--vault` pointing at a local vault and verify JSON output
- [x] 7.3 Run one pipeline script (e.g. `reindex`) and confirm log lines appear in `state/logs/app.log`
