## ADDED Requirements

### Requirement: Logger module provides named child loggers
The system SHALL provide a `createLogger(name: string)` factory in `tools/lib/logger.ts` that returns a pino child logger. Every log line MUST include the fields: `time` (epoch ms), `level`, `script` (the name passed to `createLogger`), and `msg`.

#### Scenario: Script creates a named logger and logs a message
- **WHEN** a script calls `createLogger('ingest-run')` and calls `log.info('started')`
- **THEN** a JSON log line is written to the rotating log file containing `{"level":"info","script":"ingest-run","msg":"started",...}`

#### Scenario: Logger is created without calling createLogger
- **WHEN** a script imports `logger.ts` but does not call `createLogger`
- **THEN** no log file is created and no error is thrown

### Requirement: Logs are written to a rotating file, not stdout
The system SHALL write all log output exclusively to a rotating log file at `{vault}/state/logs/app.log`. Logs MUST NOT be written to stdout or stderr.

#### Scenario: Script logs during normal execution
- **WHEN** a script runs and calls logger methods
- **THEN** log lines appear in `{vault}/state/logs/app.log` and stdout contains only the script's JSON result

#### Scenario: Log file reaches configured max size
- **WHEN** `app.log` reaches the configured `maxSize` limit
- **THEN** `pino-roll` rotates the file and a new `app.log` is started

### Requirement: Logging configuration is defined in config.ts
The system SHALL expose a `logging` configuration object in `tools/config.ts` with the following fields:
- `dir(vaultRoot: string): string` — absolute path to the log directory (e.g. `{vault}/state/logs`)
- `level: string` — default log level (e.g. `"info"`)
- `maxSize: string` — max file size before rotation (e.g. `"10m"`)
- `frequency: string` — time-based rotation frequency (e.g. `"daily"`)

#### Scenario: Operator inspects logging config
- **WHEN** a developer reads `tools/config.ts`
- **THEN** they find a `logging` key with `dir`, `level`, `maxSize`, and `frequency` fields

#### Scenario: Logger resolves log directory from vault root
- **WHEN** a script calls `createLogger(name)` with vault root configured
- **THEN** the log file is created under `{vaultRoot}/state/logs/app.log`

### Requirement: All scripts use the shared logger for operational events
Every script in `tools/*.ts` SHALL import `createLogger` and emit structured log events for at minimum: script start, script end (success), and errors caught in the top-level catch block. Internal pipeline stages SHOULD log at `info` or `debug` level with relevant context fields.

#### Scenario: Script completes successfully
- **WHEN** a script runs to completion without error
- **THEN** the log file contains at least one `info` entry from that script recording the start and one recording the end or result

#### Scenario: Script throws an unhandled error
- **WHEN** a script's top-level catch block is triggered
- **THEN** the logger MUST emit an `error` entry with `err` field containing the error message before the process exits

### Requirement: log-tail script surfaces recent logs as JSON for n8n
The system SHALL provide `tools/log-tail.ts`, a CLI script that reads the last N lines from the log file and writes them as a JSON array to stdout. It MUST accept `--vault <path>` and `--lines <n>` arguments (default: 100 lines). It MUST be callable via n8n Execute Command nodes.

#### Scenario: n8n workflow calls log-tail to retrieve recent logs
- **WHEN** an n8n Execute Command node runs `node /app/dist/tools/log-tail.js --vault /data/vault --lines 50`
- **THEN** stdout contains a JSON array of the last 50 log lines from `app.log`

#### Scenario: Log file does not exist yet
- **WHEN** `log-tail.ts` is called before any script has run
- **THEN** stdout contains an empty JSON array `[]` and the process exits with code 0
