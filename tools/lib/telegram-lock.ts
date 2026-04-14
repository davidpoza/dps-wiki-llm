import { runToolJson } from "./run-tool.js";

function lockIdFromContext(context: unknown): string | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }

  const value = (context as { telegram_lock_id?: unknown }).telegram_lock_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function releaseTelegramLockAfterFailure(vault: string, context: unknown, label: string): Promise<void> {
  const lockId = lockIdFromContext(context);
  if (!lockId) {
    return;
  }

  try {
    await runToolJson("bot-lock", {
      vault,
      args: ["release", "--name", "telegram-bot", "--lock-id", lockId]
    });
  } catch (error) {
    console.error(
      `${label} failed to release Telegram lock ${lockId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
