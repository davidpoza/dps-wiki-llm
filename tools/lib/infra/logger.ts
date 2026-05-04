import fs from "node:fs";
import path from "node:path";

import pino from "pino";
import { createStream } from "rotating-file-stream";

import { SYSTEM_CONFIG } from "../../config.js";

/**
 * Resolve vault root from --vault CLI argument or process.cwd().
 */
function resolveVaultFromArgv(): string {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf("--vault");
  if (idx !== -1 && argv[idx + 1]) {
    return path.resolve(argv[idx + 1]);
  }
  return path.resolve(process.cwd());
}

/**
 * Create a named pino child logger that writes structured JSON to the rotating
 * log file at `{vault}/state/logs/app.log`.
 *
 * app.log is always the current file. On rotation, older files shift:
 * app.log → app.1.log → app.2.log → ...
 *
 * Usage: `const log = createLogger('my-script')`
 *
 * Every log line includes `time`, `level`, `script`, and `msg`.
 *
 * @param {string} name - Script or module name attached as the `script` field
 * @returns {pino.Logger}
 */
export function createLogger(name: string): pino.Logger {
  const vaultRoot = resolveVaultFromArgv();
  const logDir = SYSTEM_CONFIG.logging.dir(vaultRoot);

  fs.mkdirSync(logDir, { recursive: true });

  const stream = createStream(
    (time: number | Date, index?: number) => (time ? `app.${index ?? 1}.log` : "app.log"),
    {
      path: logDir,
      size: SYSTEM_CONFIG.logging.maxSize,
      interval: SYSTEM_CONFIG.logging.frequency,
      maxFiles: SYSTEM_CONFIG.logging.maxFiles
    }
  );

  const logger = pino(
    {
      level: SYSTEM_CONFIG.logging.level,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: undefined
    },
    stream
  );

  return logger.child({ script: name });
}
