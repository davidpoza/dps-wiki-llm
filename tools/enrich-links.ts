#!/usr/bin/env node

import path from "node:path";

import { writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { pathExists, resolveVaultRoot, relativeVaultPath } from "./lib/fs-utils.js";
import { loadWikiDocs, analyzeWikiGraph } from "./lib/wiki-inspect.js";
import { manifestPath } from "./lib/semantic-index.js";
import { hybridSearch } from "./lib/hybrid-search-fn.js";
import { ftsSearch } from "./lib/fts-search-fn.js";
import { runToolJson } from "./lib/run-tool.js";
import { SYSTEM_CONFIG } from "./config.js";
import type { MutationPlan, MutationResult, SearchResult, WikiDoc } from "./lib/contracts.js";

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

type SearchFn = (query: string, limit: number) => Promise<SearchResult>;

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

  // ── search function ────────────────────────────────────────────────────────

  const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));
  const searchFn: SearchFn = hasSemanticIndex
    ? (query, limit) => hybridSearch(query, { vault: vaultRoot, limit })
    : (query, limit) => ftsSearch(query, { vault: vaultRoot, limit });

  log.info(
    { phase: "search-setup", has_semantic_index: hasSemanticIndex },
    "enrich-links: search function ready"
  );

  // ── discover candidates ────────────────────────────────────────────────────

  const pageActions: MutationPlan["page_actions"] = [];

  for (const doc of validTargets) {
    const resolvedPaths = new Set(graph.resolvedLinks.get(doc.relativePath) ?? []);

    let searchResult: SearchResult;
    try {
      searchResult = await searchFn(doc.title, 5);
    } catch (err) {
      log.warn(
        {
          phase: "discover/search",
          path: doc.relativePath,
          err: err instanceof Error ? err.message : String(err)
        },
        "enrich-links: search failed — skipping doc"
      );
      continue;
    }

    const candidates = searchResult.results
      .filter((r) => r.path !== doc.relativePath && !resolvedPaths.has(r.path))
      .slice(0, 5);

    if (candidates.length === 0) {
      log.info(
        { phase: "discover/search", path: doc.relativePath, candidates: 0 },
        "enrich-links: no new candidates"
      );
      continue;
    }

    log.info(
      { phase: "discover/search", path: doc.relativePath, candidates: candidates.length },
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
