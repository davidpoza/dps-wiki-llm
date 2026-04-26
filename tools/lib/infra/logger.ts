import fs from "node:fs";
import path from "node:path";

import pino from "pino";

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
  const logFile = path.join(logDir, "app.log");

  fs.mkdirSync(logDir, { recursive: true });

  const transport = pino.transport({
    target: "pino-roll",
    options: {
      file: logFile,
      frequency: SYSTEM_CONFIG.logging.frequency,
      size: SYSTEM_CONFIG.logging.maxSize,
      mkdir: true
    }
  });

  const logger = pino(
    {
      level: SYSTEM_CONFIG.logging.level,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: undefined
    },
    transport
  );

  return logger.child({ script: name });
}
