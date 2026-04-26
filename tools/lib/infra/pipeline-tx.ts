import type pino from "pino";

type RollbackHandler = {
  name: string;
  fn: () => Promise<void>;
};

/**
 * Lightweight saga-style transaction for multi-step pipelines.
 *
 * Register compensating actions with `onRollback` in the order you want them
 * to execute during a rollback (first registered → first executed). Call
 * `rollback` from the catch block; it is a no-op when no handlers have been
 * registered (i.e. the failure happened before any mutations began).
 *
 * Each handler is isolated: a failure in one handler is logged but does not
 * prevent the remaining handlers from running.
 *
 * @example
 * const tx = new PipelineTx();
 * // ... pure computation steps ...
 * tx.onRollback("git-reset", () => gitResetHard(vaultRoot, preRunSha));
 * tx.onRollback("reindex",   () => runToolJson("reindex", { vault }));
 * try {
 *   // ... mutation steps ...
 * } catch (err) {
 *   await tx.rollback(log);
 *   throw err;
 * }
 */
export class PipelineTx {
  private readonly handlers: RollbackHandler[] = [];

  onRollback(name: string, fn: () => Promise<void>): void {
    this.handlers.push({ name, fn });
  }

  async rollback(log: pino.Logger): Promise<void> {
    if (this.handlers.length === 0) return;

    log.warn({ handlers: this.handlers.length }, "pipeline-tx: starting rollback");

    for (const handler of this.handlers) {
      try {
        log.info({ handler: handler.name }, "pipeline-tx: compensating action started");
        await handler.fn();
        log.info({ handler: handler.name }, "pipeline-tx: compensating action completed");
      } catch (err) {
        log.error(
          { handler: handler.name, err: err instanceof Error ? err.message : String(err) },
          "pipeline-tx: compensating action failed — continuing with remaining handlers"
        );
      }
    }

    log.warn("pipeline-tx: rollback completed");
  }
}
