import path from "node:path";

import { chatCompletion, chatText } from "../../lib/llm.js";
import { runToolJson } from "../../lib/run-tool.js";
import {
  loadManifest,
  normalizeTextForEmbedding,
  extractSummarySection,
  hashText
} from "../../lib/semantic-index.js";
import { SYSTEM_CONFIG } from "../../config.js";
import type { MutationPlan, WikiDoc } from "../../lib/contracts.js";
import type { Logger } from "pino";

/**
 * Call the LLM to produce a concise Summary for a wiki note.
 */
export async function generateSummaryText(doc: WikiDoc): Promise<string | null> {
  const body = doc.raw.replace(/^---[\s\S]*?---\n?/, "").trim();
  const maxBody = 6000;
  const truncatedBody = body.length > maxBody ? body.slice(0, maxBody) + "\n...[truncated]" : body;

  const messages = [
    {
      role: "system" as const,
      content: `You are a knowledge base curator. Write a concise, information-dense summary of the provided note.
Rules:
- Plain prose only — no headings, no bullet points, no markdown.
- Maximum ${SYSTEM_CONFIG.semantic.summaryMaxLength} characters.
- Capture the key concepts, facts, and relationships so the summary can stand in for the full note in semantic search.
- Do not include filler phrases like "This note discusses..." — start directly with the content.
- Respond with only the summary text, nothing else.`
    },
    {
      role: "user" as const,
      content: `Note title: ${doc.title}\n\n${truncatedBody}`
    }
  ];

  try {
    const response = await chatCompletion({ messages, temperature: 0.2 });
    const text = chatText(response, "generate-summary").trim();
    return text.length > 0 ? text.slice(0, SYSTEM_CONFIG.semantic.summaryMaxLength) : null;
  } catch {
    return null;
  }
}

/**
 * Generate and apply ## Summary sections for all docs in the list.
 * Each doc gets its own apply-update call to isolate failures.
 * Returns paths of successfully updated docs.
 */
export async function applySummaryFixes(
  candidates: Array<{ doc: WikiDoc; normalizedChars: number }>,
  vaultRoot: string,
  log: Logger
): Promise<string[]> {
  const applied: string[] = [];

  for (const { doc, normalizedChars } of candidates) {
    log.info(
      { phase: "generate-summary/start", path: doc.relativePath, normalized_chars: normalizedChars },
      "health-check: [generate-summary] generating summary via LLM"
    );

    const summaryText = await generateSummaryText(doc);

    if (!summaryText) {
      log.warn(
        { phase: "generate-summary/skip", path: doc.relativePath },
        "health-check: [generate-summary] LLM returned empty summary — skipping"
      );
      continue;
    }

    const plan: MutationPlan = {
      plan_id: `health-check-summary-${path.basename(doc.relativePath, ".md")}-${Date.now()}`,
      operation: "health-check",
      summary: `health-check: add ## Summary to ${doc.relativePath}`,
      source_refs: [],
      page_actions: [
        {
          path: doc.relativePath,
          action: "update" as const,
          change_type: "summary_added",
          payload: {
            sections: { Summary: summaryText }
          }
        }
      ],
      index_updates: [],
      post_actions: { reindex: false, commit: false }
    };

    try {
      await runToolJson("apply-update", { vault: vaultRoot, input: plan });
      applied.push(doc.relativePath);
      log.info(
        { phase: "generate-summary/done", path: doc.relativePath, summary_chars: summaryText.length },
        "health-check: [generate-summary] summary applied"
      );
    } catch (err) {
      log.warn(
        { phase: "generate-summary/error", path: doc.relativePath, err: err instanceof Error ? err.message : String(err) },
        "health-check: [generate-summary] apply-update failed — skipping"
      );
    }
  }

  return applied;
}

/**
 * Returns true if any wiki doc has a missing or stale embedding entry.
 * Replicates the hash-diff logic from embed-index without calling the model.
 */
export async function hasStaleEmbeddings(vaultRoot: string, docs: WikiDoc[]): Promise<boolean> {
  const manifest = await loadManifest(vaultRoot).catch(() => null);
  const items = manifest?.items ?? {};

  for (const doc of docs) {
    const noteId = doc.relativePath.replace(/\\/g, "/");
    const normalized = normalizeTextForEmbedding(doc.raw);

    if (normalized.length < SYSTEM_CONFIG.semantic.minChars) continue;

    let embedInput: string;
    if (normalized.length <= SYSTEM_CONFIG.semantic.maxInputChars) {
      embedInput = normalized;
    } else {
      const summary = extractSummarySection(doc.raw);
      embedInput = summary
        ? summary.slice(0, SYSTEM_CONFIG.semantic.summaryMaxLength)
        : normalized.slice(0, SYSTEM_CONFIG.semantic.maxInputChars);
    }

    const hash = hashText(embedInput);
    if (items[noteId]?.hash !== hash) return true;
  }

  return false;
}
