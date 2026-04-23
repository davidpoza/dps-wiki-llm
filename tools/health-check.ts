#!/usr/bin/env node

import path from "node:path";
import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import {
  ensureDirectory,
  pathExists,
  resolveVaultRoot,
  resolveWithinRoot,
  writeJsonFile,
  writeTextFile
} from "./lib/fs-utils.js";
import { analyzeWikiGraph, loadWikiDocs } from "./lib/wiki-inspect.js";
import { loadManifest, loadAllEmbeddingUnits, manifestPath } from "./lib/semantic-index.js";
import { runToolJson } from "./lib/run-tool.js";
import { hybridSearch } from "./lib/hybrid-search-fn.js";
import { ftsSearch } from "./lib/fts-search-fn.js";
import { getGitHead } from "./lib/git.js";
import { SYSTEM_CONFIG } from "./config.js";
import { buildFinding, nowStamp, severityRank } from "./lib/maintenance.js";
import { buildHealthCheckNotification } from "./services/notifications/telegram.js";
import { generateRenamePlan } from "./rename-plan.js";
import type {
  CommitInput,
  MaintenanceFinding,
  MaintenanceResult,
  MissingPage,
  MutationResult,
  WikiDoc
} from "./lib/contracts.js";

import { runPerDocChecks } from "./services/health/per-doc-checks.js";
import {
  collectBrokenLinks,
  collectMissingPages,
  resolveBrokenLinks,
  pruneWeakRelatedLinks,
  applyLinkPruning,
  sanitizeRelatedSections,
  discoverNewLinks,
  applyDiscoveredLinks
} from "./services/health/link-ops.js";
import type { BrokenLinkReport, LinkResolution, NewLinkCandidate, SearchFn } from "./services/health/link-ops.js";
import { applySummaryFixes, hasStaleEmbeddings } from "./services/health/summary-ops.js";
import { countApplied, renderSummary } from "./services/health/report.js";

/**
 * Run deeper semantic and traceability validation over the wiki graph.
 * Reports broken wiki links, searches for candidate resolutions, and emits a
 * Telegram notification. Broken links are never fixed automatically.
 */

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("health-check");
  const vaultRoot = resolveVaultRoot(args.vault);

  log.info({ phase: "startup", vault_root: vaultRoot }, "health-check: started");
  log.info({ phase: "startup-reindex" }, "health-check: [startup-reindex] rebuilding search index before analysis");
  await runToolJson("reindex", { vault: vaultRoot });
  log.info({ phase: "startup-reindex" }, "health-check: [startup-reindex] index rebuilt");
  const canApplyMutations = args.write && (await getGitHead(vaultRoot)) !== null;
  if (!canApplyMutations) {
    log.info(
      { phase: "mutation-mode", write: args.write },
      "health-check: [mutation-mode] running without automatic wiki mutations"
    );
  }

  const excludeProjects = (d: WikiDoc[]): WikiDoc[] =>
    d.filter((doc) => !doc.relativePath.startsWith("wiki/projects/"));

  let docs = excludeProjects(await loadWikiDocs(vaultRoot));

  const stale = await hasStaleEmbeddings(vaultRoot, docs);
  if (stale) {
    log.info({ phase: "startup-embedindex" }, "health-check: [startup-embedindex] stale embeddings detected — rebuilding semantic index");
    await runToolJson("embed-index", { vault: vaultRoot });
    log.info({ phase: "startup-embedindex" }, "health-check: [startup-embedindex] semantic index rebuilt");
  } else {
    log.info({ phase: "startup-embedindex" }, "health-check: [startup-embedindex] semantic index up to date — skipping");
  }

  let graph = analyzeWikiGraph(docs);

  const totalBrokenLinks = Array.from(graph.brokenLinks.values()).reduce((sum, arr) => sum + arr.length, 0);
  const brokenLinks = collectBrokenLinks(graph, log);

  log.info(
    {
      phase: "analyze-graph",
      docs: docs.length,
      alias_map_size: graph.aliasMap.size,
      broken_links: brokenLinks.length,
      total_broken_links: totalBrokenLinks,
      ambiguous_targets: Array.from(graph.ambiguousTargets.values()).reduce((sum, arr) => sum + arr.length, 0)
    },
    "health-check: [analyze-graph] wiki graph analyzed"
  );

  // ── per-doc checks ────────────────────────────────────────────────────────

  log.info({ phase: "check-docs", docs: docs.length }, "health-check: [check-docs] running per-doc checks");

  const { findings: perDocFindings, summaryNeeded, summaryMisplaced } = runPerDocChecks(docs, graph);
  const findings: MaintenanceFinding[] = [...perDocFindings];

  const missingPages = collectMissingPages(graph);
  for (const item of missingPages) {
    findings.push(
      buildFinding(
        "warning",
        item.referenced_from[0],
        "missing_page",
        `The knowledge base references missing page target [[${item.target}]] from ${item.referenced_from.join(", ")}.`,
        `Resolve [[${item.target}]] in ${item.referenced_from.join(", ")}: create that page if the concept is real, or remove/correct the unresolved link.`,
        false,
        { target: item.target, referenced_from: item.referenced_from }
      )
    );
  }

  log.info(
    {
      phase: "check-docs",
      findings: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      suggestion: findings.filter((f) => f.severity === "suggestion").length,
      missing_pages: missingPages.length
    },
    "health-check: [check-docs] per-doc checks completed"
  );

  // ── generate missing Summary sections (concepts + sources only) ─────────

  log.info(
    { phase: "generate-summary/start", candidates: summaryNeeded.length },
    "health-check: [generate-summary] starting Summary generation for long notes"
  );

  const summaryApplied = canApplyMutations && summaryNeeded.length > 0
    ? await applySummaryFixes(summaryNeeded, vaultRoot, log)
    : [];

  // Emit a finding for each doc — auto_fixed=true when applied, warning when failed.
  for (const { doc, normalizedChars } of summaryNeeded) {
    const fixed = summaryApplied.includes(doc.relativePath);
    findings.push(
      buildFinding(
        "warning",
        doc.relativePath,
        "missing_summary",
        `The note's normalised text (${normalizedChars} chars) exceeds the embedding limit (${SYSTEM_CONFIG.semantic.maxInputChars} chars).${fixed ? " A ## Summary section was auto-generated." : " No ## Summary section could be generated."}`,
        fixed ? "Summary generated — verify the content and re-run embed-index." : `Add a ## Summary section (up to ${SYSTEM_CONFIG.semantic.summaryMaxLength} chars) manually.`,
        true,
        { normalized_chars: normalizedChars, max_input_chars: SYSTEM_CONFIG.semantic.maxInputChars, auto_fixed: fixed }
      )
    );
  }

  log.info(
    { phase: "generate-summary/done", applied: summaryApplied.length, skipped: summaryNeeded.length - summaryApplied.length },
    "health-check: [generate-summary] done"
  );

  if (summaryApplied.length > 0) {
    docs = excludeProjects(await loadWikiDocs(vaultRoot));
    graph = analyzeWikiGraph(docs);
  }

  // ── reposition misplaced Summary sections ─────────────────────────────────

  log.info(
    { phase: "reposition-summary/start", candidates: summaryMisplaced.length },
    "health-check: [reposition-summary] fixing misplaced Summary sections"
  );

  const repositionApplied: string[] = [];

  for (const doc of summaryMisplaced) {
    if (!canApplyMutations) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "summary_wrong_position",
          "The ## Summary section is not the first section of the note.",
          "Move ## Summary to be the first ## section after the H1 heading.",
          false,
          { auto_fixed: false }
        )
      );
      continue;
    }

    const repositionPlan = {
      plan_id: `health-check-reposition-summary-${path.basename(doc.relativePath, ".md")}-${Date.now()}`,
      operation: "health-check",
      summary: `health-check: reposition ## Summary to first section in ${doc.relativePath}`,
      source_refs: [],
      page_actions: [
        {
          path: doc.relativePath,
          action: "update" as const,
          change_type: "summary_repositioned",
          payload: {}
        }
      ],
      index_updates: [],
      post_actions: { reindex: false, commit: false }
    };

    try {
      await runToolJson("apply-update", { vault: vaultRoot, input: repositionPlan });
      repositionApplied.push(doc.relativePath);
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "summary_wrong_position",
          "The ## Summary section was not the first section of the note.",
          "Automatically repositioned to the first ## section.",
          true,
          { auto_fixed: true }
        )
      );
      log.info(
        { phase: "reposition-summary/done", path: doc.relativePath },
        "health-check: [reposition-summary] Summary repositioned"
      );
    } catch (err) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "summary_wrong_position",
          "The ## Summary section is not the first section of the note.",
          "Move ## Summary to be the first ## section after the H1 heading.",
          false,
          { auto_fixed: false }
        )
      );
      log.warn(
        { phase: "reposition-summary/error", path: doc.relativePath, err: err instanceof Error ? err.message : String(err) },
        "health-check: [reposition-summary] apply-update failed — skipping"
      );
    }
  }

  log.info(
    { phase: "reposition-summary/done", applied: repositionApplied.length },
    "health-check: [reposition-summary] complete"
  );

  // ── sanitize Related sections (structural cleanup, no embeddings needed) ───

  log.info({ phase: "sanitize-related/start" }, "health-check: [sanitize-related] starting structural cleanup");

  const sanitized = canApplyMutations ? await sanitizeRelatedSections(docs, graph, vaultRoot, log) : [];

  if (sanitized.length > 0) {
    log.info({ phase: "sanitize-related/done", docs_affected: sanitized.length }, "health-check: [sanitize-related] done, reloading");
    docs = excludeProjects(await loadWikiDocs(vaultRoot));
    graph = analyzeWikiGraph(docs);
  }

  // ── prune weak Related links ───────────────────────────────────────────────

  log.info({ phase: "prune-related/start" }, "health-check: [prune-related] starting weak link pruning");

  const sharedManifest = await loadManifest(vaultRoot).catch(() => null);
  const sharedUnits = sharedManifest ? await loadAllEmbeddingUnits(vaultRoot, sharedManifest) : [];
  const sharedEmbeddingMap = new Map<string, number[]>(sharedUnits.map((u) => [u.path, u.embedding]));

  const weakLinks = await pruneWeakRelatedLinks(docs, graph, vaultRoot, log, sharedEmbeddingMap);

  let appliedPruning: Pick<MutationResult, "created" | "updated" | "skipped"> | null = null;

  if (canApplyMutations && weakLinks.length > 0) {
    const pruneResult = await applyLinkPruning(weakLinks, vaultRoot, log);
    appliedPruning = {
      created: pruneResult.created,
      updated: pruneResult.updated,
      skipped: pruneResult.skipped
    };
    docs = excludeProjects(await loadWikiDocs(vaultRoot));
    graph = analyzeWikiGraph(docs);
  }

  log.info(
    { phase: "prune-related/done", docs_affected: weakLinks.length },
    "health-check: [prune-related] weak link pruning complete"
  );

  // ── broken link reporting and resolution suggestions ───────────────────────

  const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));

  const searchFn: SearchFn = hasSemanticIndex
    ? (query, limit) => hybridSearch(query, { vault: vaultRoot, limit })
    : (query, limit) => ftsSearch(query, { vault: vaultRoot, limit });

  log.info(
    { phase: "resolve-broken-links/start", has_semantic_index: hasSemanticIndex },
    "health-check: [resolve-broken-links] starting broken link suggestion search"
  );

  const linkResolutions = await resolveBrokenLinks(docs, graph, vaultRoot, searchFn, new Set(), log);

  let appliedLinkFixes: Pick<MutationResult, "created" | "updated" | "skipped"> | null = null;
  log.info(
    { phase: "resolve-broken-links/report-only", suggestions: linkResolutions.length },
    "health-check: [resolve-broken-links] suggestions recorded without applying fixes"
  );

  // ── duplicate slug detection ───────────────────────────────────────────────

  log.info({ phase: "duplicate-slug/start" }, "health-check: [duplicate-slug] checking for slug conflicts across docTypes");

  const slugToDocPaths = new Map<string, string[]>();
  for (const doc of docs) {
    const slug = doc.relativePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
    if (!slug) continue;
    const existing = slugToDocPaths.get(slug) ?? [];
    existing.push(doc.relativePath);
    slugToDocPaths.set(slug, existing);
  }

  for (const [slug, paths] of slugToDocPaths) {
    if (paths.length < 2) continue;
    log.warn(
      { phase: "duplicate-slug", slug, paths },
      "health-check: [duplicate-slug] slug shared by multiple docs"
    );
    for (const p of paths) {
      findings.push(
        buildFinding(
          "critical",
          p,
          "duplicate_slug",
          `Slug "${slug}" is shared by ${paths.length} docs: ${paths.join(", ")}`,
          "Rename or merge the duplicate docs so each slug is unique across the wiki."
        )
      );
    }
  }

  log.info(
    { phase: "duplicate-slug/done", conflicts: [...slugToDocPaths.values()].filter((p) => p.length > 1).length },
    "health-check: [duplicate-slug] done"
  );

  // ── standardize slugs (detect non-English kebab-case filenames) ───────────

  log.info({ phase: "standardize-slugs/start" }, "health-check: [standardize-slugs] detecting non-compliant slugs");

  try {
    const slugStats = await generateRenamePlan(vaultRoot, log);
    if (slugStats.new_entries > 0) {
      log.warn(
        { phase: "standardize-slugs", new_entries: slugStats.new_entries, total_pending: slugStats.total_pending },
        "health-check: [standardize-slugs] non-compliant slugs added to rename plan"
      );
      findings.push(
        buildFinding(
          "warning",
          "state/maintenance/rename-plan.json",
          "non_english_slug",
          `${slugStats.new_entries} non-English or non-kebab-case slug(s) detected (${slugStats.total_pending} total pending renames).`,
          "Run /renameplan to review and /applyrename to apply the rename plan."
        )
      );
    } else {
      log.info({ phase: "standardize-slugs/done", total_pending: slugStats.total_pending }, "health-check: [standardize-slugs] no new non-compliant slugs");
    }
  } catch (err) {
    log.warn(
      { phase: "standardize-slugs", err: err instanceof Error ? err.message : String(err) },
      "health-check: [standardize-slugs] failed — skipping"
    );
  }

  // ── discover new links ────────────────────────────────────────────────────

  log.info(
    { phase: "discover-new-links/start" },
    "health-check: [discover-new-links] starting new link discovery"
  );

  const discoveredLinks = await discoverNewLinks(docs, graph, vaultRoot, new Set(), log, sharedUnits, sharedEmbeddingMap);

  // ── apply discovered links ────────────────────────────────────────────────

  let appliedNewLinks: Pick<MutationResult, "created" | "updated" | "skipped"> | null = null;

  if (canApplyMutations && discoveredLinks.length > 0) {
    const mutationResult = await applyDiscoveredLinks(discoveredLinks, vaultRoot, log);
    appliedNewLinks = {
      created: mutationResult.created,
      updated: mutationResult.updated,
      skipped: mutationResult.skipped
    };
  }

  // ── reindex + commit if health-check applied allowed mutations ────────────

  const allAffected = [
    ...(appliedNewLinks?.updated ?? []),
    ...(appliedNewLinks?.created ?? []),
    ...summaryApplied,
    ...repositionApplied
  ];
  const uniqueAffected = [...new Set(allAffected)];

  if (uniqueAffected.length > 0) {
    log.info({ phase: "reindex", affected: uniqueAffected.length }, "health-check: [reindex] rebuilding search index");
    await runToolJson("reindex", { vault: vaultRoot });
    log.info({ phase: "reindex" }, "health-check: [reindex] index rebuilt");

    const newCount = countApplied(appliedNewLinks);
    const commitInput: CommitInput = {
      operation: "health-check",
      summary: `Health check: ${newCount} new link(s) added, ${summaryApplied.length} summary section(s) generated, ${repositionApplied.length} summary section(s) repositioned`,
      source_refs: [],
      affected_notes: uniqueAffected,
      paths_to_stage: [...uniqueAffected, SYSTEM_CONFIG.paths.dbPath],
      feedback_record_ref: null,
      mutation_result_ref: null,
      commit_message: `health-check: ${newCount} new link(s) + ${summaryApplied.length} summary generated + ${repositionApplied.length} summary repositioned`
    };

    log.info(
      { phase: "commit", affected: uniqueAffected.length },
      "health-check: [commit] committing link changes"
    );

    const commitResult = await runToolJson<Record<string, unknown>>("commit", {
      vault: vaultRoot,
      input: commitInput
    });

    log.info(
      { phase: "commit", commit_sha: commitResult.commit_sha ?? null },
      "health-check: [commit] committed"
    );
  }

  // ── sort findings ──────────────────────────────────────────────────────────

  findings.sort((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return `${left.path}:${left.issue_type}`.localeCompare(`${right.path}:${right.issue_type}`);
  });

  // ── write report ───────────────────────────────────────────────────────────

  const runId = `health-check-${new Date().toISOString().slice(0, 10)}`;
  const statsObj = {
    docs: docs.length,
    findings: findings.length,
    critical: findings.filter((item) => item.severity === "critical").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    suggestion: findings.filter((item) => item.severity === "suggestion").length
  };

  const result = {
    run_id: runId,
    kind: "health-check" as const,
    stats: statsObj,
    findings,
    missing_pages: missingPages,
    broken_links: brokenLinks,
    link_resolutions: linkResolutions,
    applied_link_fixes: appliedLinkFixes,
    applied_pruning: appliedPruning,
    discovered_links: discoveredLinks,
    applied_new_links: appliedNewLinks,
    report_path: undefined as string | undefined,
    summary_path: undefined as string | undefined
  };

  if (args.write) {
    const stamp = nowStamp();
    const reportDir = resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.maintenanceDir);
    const reportPath = resolveWithinRoot(vaultRoot, `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-health-check.json`);
    const summaryPath = resolveWithinRoot(vaultRoot, `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-health-check.md`);
    await ensureDirectory(reportDir);
    await writeJsonFile(reportPath, result);
    await writeTextFile(summaryPath, renderSummary(result));
    result.report_path = `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-health-check.json`;
    result.summary_path = `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-health-check.md`;
  }

  // ── telegram notification ──────────────────────────────────────────────────

  const topCritical = findings
    .filter((f) => f.severity === "critical")
    .slice(0, 5)
    .map((f) => ({ path: f.path, issue_type: f.issue_type }));

  const appliedFixCount = countApplied(appliedLinkFixes);
  const appliedPruningCount = countApplied(appliedPruning);
  const appliedNewCount = countApplied(appliedNewLinks);

  const telegramFields = buildHealthCheckNotification({
    run_id: runId,
    stats: statsObj,
    missing_pages: missingPages.length,
    broken_links: brokenLinks.length,
    link_resolutions: linkResolutions.length,
    pruned_links: appliedPruningCount,
    discovered_links: discoveredLinks.length,
    applied_new_links: appliedNewCount,
    top_critical_findings: topCritical,
    report_path: result.report_path
  });

  log.info(
    {
      phase: "telegram",
      enabled: telegramFields.telegram_enabled,
      skip_reason: telegramFields.telegram_skip_reason ?? null
    },
    "health-check: [telegram] notification built"
  );

  // ── final output ───────────────────────────────────────────────────────────

  const output = {
    ...result,
    ...telegramFields
  };

  log.info(
    {
      phase: "done",
      docs: statsObj.docs,
      findings: statsObj.findings,
      critical: statsObj.critical,
      missing_pages: missingPages.length,
      broken_links: brokenLinks.length,
      link_resolutions: linkResolutions.length,
      discovered_links: discoveredLinks.length,
      applied_new_links: appliedNewCount
    },
    "health-check: completed"
  );

  writeJsonStdout(output, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
