#!/usr/bin/env node

import path from "node:path";

import { writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { resolveVaultRoot, relativeVaultPath } from "./lib/fs-utils.js";
import { loadWikiDocs, analyzeWikiGraph } from "./lib/wiki-inspect.js";
import { loadManifest, loadAllEmbeddingUnits, cosineSimilarity } from "./lib/semantic-index.js";
import { createLocalTransformersProvider } from "./lib/local-transformers-provider.js";
import { runToolJson } from "./lib/run-tool.js";
import { SYSTEM_CONFIG } from "./config.js";
import type { MutationPlan, MutationResult, WikiDoc } from "./lib/contracts.js";

/**
 * Enrich one or more wiki documents by discovering related notes and adding
 * them to the `Related` section. Content is never modified — only `Related`
 * is upserted via apply-update's non-destructive merge.
 *
 * Usage:
 *   node dist/tools/enrich-links.js --vault <path> [--paths <path1> [<path2> ...]]
 *
 * When --paths is omitted all typed documents in the wiki are processed.
 */

interface EnrichLinksOutput {
  status: "enrich_completed";
  updated: string[];
  skipped: string[];
}

function parseEnrichArgs(argv: string[] = process.argv.slice(2)): { vault: string; paths: string[] } {
  let vault = SYSTEM_CONFIG.cli.defaultVault();
  const paths: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--vault") {
      vault = argv[++i];
      continue;
    }

    if (token === "--paths") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        paths.push(argv[++i]);
      }
      continue;
    }

    if (token === "--compact" || token === "--pretty") {
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  return { vault, paths };
}

async function main(): Promise<void> {
  const { vault, paths } = parseEnrichArgs();
  const log = createLogger("enrich-links");
  const vaultRoot = resolveVaultRoot(vault);

  log.info({ phase: "startup", vault_root: vaultRoot, target_paths: paths }, "enrich-links: started");

  const docs = await loadWikiDocs(vaultRoot);
  const graph = analyzeWikiGraph(docs);

  const typedDocTypes = new Set([...SYSTEM_CONFIG.wiki.typedDocTypes, "source"]);

  // ── select target docs ─────────────────────────────────────────────────────

  let targetDocs: WikiDoc[];

  if (paths.length > 0) {
    const normalizedPaths = new Set(
      paths.map((p) => relativeVaultPath(vaultRoot, path.resolve(vaultRoot, p)))
    );

    targetDocs = docs.filter((doc) => normalizedPaths.has(doc.relativePath));

    for (const p of normalizedPaths) {
      if (!docs.some((d) => d.relativePath === p)) {
        log.warn({ phase: "select-targets", path: p }, "enrich-links: path not found in wiki — skipping");
      }
    }
  } else {
    targetDocs = docs.filter((doc) => typedDocTypes.has(doc.docType));
  }

  const validTargets = targetDocs.filter((doc) => {
    if (!typedDocTypes.has(doc.docType)) {
      log.warn(
        { phase: "select-targets", path: doc.relativePath, doc_type: doc.docType },
        "enrich-links: unknown docType — skipping"
      );
      return false;
    }
    return true;
  });

  log.info(
    { phase: "select-targets", count: validTargets.length },
    "enrich-links: target docs selected"
  );

  // ── load semantic index once ───────────────────────────────────────────────

  const manifest = await loadManifest(vaultRoot).catch(() => null);
  const units = manifest ? await loadAllEmbeddingUnits(vaultRoot, manifest) : [];

  const titleVecs: number[][] = [];
  if (units.length > 0) {
    const provider = createLocalTransformersProvider();
    const vecs = await provider.embed(validTargets.map((d) => d.title));
    titleVecs.push(...vecs);
  }

  // ── discover candidates ────────────────────────────────────────────────────

  const candidateLimit = SYSTEM_CONFIG.enrich.candidateLimit;
  const minCosine = SYSTEM_CONFIG.enrich.minCosineSimilarity;
  const pageActions: MutationPlan["page_actions"] = [];

  for (let i = 0; i < validTargets.length; i++) {
    const doc = validTargets[i];
    const queryVec = titleVecs[i];

    if (!queryVec) continue;

    const resolvedPaths = new Set(graph.resolvedLinks.get(doc.relativePath) ?? []);

    const scored = units
      .filter((u) => u.path !== doc.relativePath && !resolvedPaths.has(u.path))
      .map((u) => ({ path: u.path, title: u.title, doc_type: u.doc_type, score: cosineSimilarity(queryVec, u.embedding) }))
      .sort((a, b) => b.score - a.score);

    for (const r of scored) {
      log.debug(
        {
          phase: "discover/score",
          path: doc.relativePath,
          candidate: r.path,
          score: r.score,
          threshold: minCosine,
          above_threshold: r.score >= minCosine
        },
        "enrich-links: candidate score"
      );
    }

    const candidates = scored
      .filter((r) => r.score >= minCosine)
      .slice(0, candidateLimit);

    if (candidates.length === 0) {
      log.info(
        { phase: "discover/search", path: doc.relativePath, candidates: 0, min_cosine: minCosine },
        "enrich-links: no new candidates"
      );
      continue;
    }

    log.info(
      { phase: "discover/search", path: doc.relativePath, candidates: candidates.length, min_cosine: minCosine },
      "enrich-links: candidates found"
    );

    const links = candidates.map((c) => {
      const slug = c.path.split("/").pop()?.replace(/\.md$/, "") ?? c.path;
      return `[[${slug}|${c.title}]]`;
    });

    pageActions.push({
      path: doc.relativePath,
      action: "update",
      change_type: "link_addition",
      payload: {
        sections: {
          Related: links
        }
      }
    });
  }

  // ── apply mutations ────────────────────────────────────────────────────────

  if (pageActions.length === 0) {
    log.info({ phase: "apply", page_actions: 0 }, "enrich-links: no mutations needed");
    const output: EnrichLinksOutput = { status: "enrich_completed", updated: [], skipped: [] };
    writeJsonStdout(output);
    return;
  }

  const plan: MutationPlan = {
    plan_id: `enrich-links-${new Date().toISOString().slice(0, 10)}`,
    operation: "manual",
    summary: `enrich-links: adding Related links to ${pageActions.length} doc(s)`,
    source_refs: [],
    page_actions: pageActions,
    index_updates: [],
    post_actions: { reindex: false, commit: false }
  };

  log.info({ phase: "apply", page_actions: pageActions.length }, "enrich-links: applying mutations");

  const result = await runToolJson<MutationResult>("apply-update", {
    vault: vaultRoot,
    input: plan
  });

  log.info(
    { phase: "done", updated: result.updated.length, skipped: result.skipped.length },
    "enrich-links: completed"
  );

  const output: EnrichLinksOutput = {
    status: "enrich_completed",
    updated: result.updated,
    skipped: result.skipped
  };

  writeJsonStdout(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
