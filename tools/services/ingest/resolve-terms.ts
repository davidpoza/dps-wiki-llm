/**
 * @module resolve-terms
 *
 * Post-processes a MutationPlan produced by the LLM to enforce the rule that
 * topics are never created automatically.  For each term candidate (concept or
 * topic action) the module applies the following resolution chain:
 *
 *   1. Topic create → noop  (topics are user-only)
 *   2. Concept create → check against existing topic embeddings via cosine
 *      similarity.  If the term is already covered by a topic (score ≥
 *      TOPIC_MATCH_THRESHOLD) the action is converted into an update on that
 *      topic instead of creating a concept.
 *   3. If no topic match → check whether the concept file already exists on
 *      disk.  If so, change action from "create" to "update" (dedup).
 *   4. Validate that the concept slug is valid kebab-case.  Invalid slugs are
 *      converted to noop with a warning.
 *   5. All other actions pass through unchanged.
 *
 * Fail-safe: if the semantic index is absent or empty, steps 2 is skipped and
 * processing continues as if no topic matched.
 */

import path from "node:path";
import type { Logger } from "pino";

import { pathExists } from "../../lib/fs-utils.js";
import {
  loadManifest,
  loadAllEmbeddingUnits,
  cosineSimilarity
} from "../../lib/semantic-index.js";
import { createLocalTransformersProvider } from "../../lib/local-transformers-provider.js";
import type { MutationPlan, MutationPageAction } from "../../lib/contracts.js";
import { resolvedTopicMatchThreshold } from "../../config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolveTermsResult {
  plan: MutationPlan;
  /** Number of concept terms matched and redirected to an existing topic. */
  topicMatches: number;
  /** Number of concept "create" actions changed to "update" due to existing file. */
  conceptDedups: number;
  /** Number of actions converted to noop (blocked topic creates or invalid slugs). */
  nooped: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate that a slug is lowercase kebab-case. */
function isKebabCase(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Resolve term candidates in a mutation plan against existing topics and
 * concept files, returning a new plan with resolved actions.
 *
 * @param plan       - The guardrailed mutation plan from the LLM.
 * @param vaultRoot  - Absolute path to the vault root.
 * @param log        - Pino logger instance from the calling pipeline.
 * @param threshold  - Cosine similarity threshold for topic matching.
 *                     Defaults to TOPIC_MATCH_THRESHOLD env var or 0.72.
 */
export async function resolveTerms(
  plan: MutationPlan,
  vaultRoot: string,
  log: Logger,
  threshold: number = resolvedTopicMatchThreshold()
): Promise<ResolveTermsResult> {
  // ── Load topic embedding units (fail-safe) ───────────────────────────────

  type EmbeddingUnit = Awaited<ReturnType<typeof loadAllEmbeddingUnits>>[number];
  let topicUnits: EmbeddingUnit[] = [];

  try {
    const manifest = await loadManifest(vaultRoot);
    const allUnits = await loadAllEmbeddingUnits(vaultRoot, manifest);
    topicUnits = allUnits.filter((u) => u.doc_type === "topic");
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "resolve-terms: could not load semantic index — topic matching skipped"
    );
  }

  const provider = topicUnits.length > 0 ? createLocalTransformersProvider() : null;

  let topicMatches = 0;
  let conceptDedups = 0;
  let nooped = 0;

  const resolvedActions: MutationPageAction[] = [];

  for (const action of plan.page_actions) {

    // ── 1. Block auto-create of topics ──────────────────────────────────────
    if (action.doc_type === "topic" && action.action === "create") {
      log.warn(
        { path: action.path },
        "resolve-terms: blocking auto-create of topic — converting to noop"
      );
      resolvedActions.push({ ...action, action: "noop" });
      nooped++;
      continue;
    }

    // ── 2. Resolve concept create actions ───────────────────────────────────
    if (action.doc_type === "concept" && action.action === "create") {
      const slug = path.basename(action.path, ".md");

      // 2a. Validate slug format
      if (!isKebabCase(slug)) {
        log.warn(
          { path: action.path, slug },
          "resolve-terms: concept slug is not valid kebab-case — converting to noop"
        );
        resolvedActions.push({ ...action, action: "noop" });
        nooped++;
        continue;
      }

      // 2b. Try to match against existing topics via embedding
      const query = typeof action.payload?.title === "string" && action.payload.title
        ? action.payload.title
        : slug.replace(/-/g, " ");

      let matchedTopicUnit: EmbeddingUnit | null = null;
      let matchScore = 0;

      if (provider && topicUnits.length > 0) {
        try {
          const [queryVec] = await provider.embed([query]);
          for (const unit of topicUnits) {
            const score = cosineSimilarity(queryVec, unit.embedding);
            if (score > matchScore) {
              matchScore = score;
              matchedTopicUnit = unit;
            }
          }
        } catch (err) {
          log.warn(
            { err: err instanceof Error ? err.message : String(err), path: action.path },
            "resolve-terms: embedding error during topic matching — skipping match"
          );
          matchedTopicUnit = null;
        }
      }

      if (matchedTopicUnit && matchScore >= threshold) {
        log.info(
          {
            concept_path: action.path,
            topic_path: matchedTopicUnit.path,
            score: matchScore,
            threshold
          },
          "resolve-terms: term matched to existing topic — converting to topic update"
        );

        resolvedActions.push({
          path: matchedTopicUnit.path,
          action: "update",
          doc_type: "topic",
          change_type: "reference",
          idempotency_key: action.idempotency_key
            ? `topic-match:${action.idempotency_key}`
            : undefined,
          payload: {
            sections: action.payload?.sections ?? {}
          }
        });
        topicMatches++;
        continue;
      }

      // 2c. Dedup: check if concept file already exists on disk
      const conceptAbsPath = path.join(vaultRoot, action.path);
      const exists = await pathExists(conceptAbsPath);

      if (exists) {
        log.info(
          { path: action.path },
          "resolve-terms: concept already exists on disk — changing create to update"
        );
        resolvedActions.push({ ...action, action: "update" });
        conceptDedups++;
        continue;
      }

      // No topic match and file doesn't exist → create as-is
      resolvedActions.push(action);
      continue;
    }

    // ── All other actions pass through unchanged ──────────────────────────
    resolvedActions.push(action);
  }

  log.info(
    { topicMatches, conceptDedups, nooped, total: plan.page_actions.length },
    "resolve-terms: term resolution complete"
  );

  return {
    plan: { ...plan, page_actions: resolvedActions },
    topicMatches,
    conceptDedups,
    nooped
  };
}
