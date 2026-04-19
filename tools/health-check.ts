#!/usr/bin/env node

import fs from "node:fs/promises";
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
import { loadManifest, loadAllEmbeddingUnits, cosineSimilarity, manifestPath } from "./lib/semantic-index.js";
import { chatCompletion, chatText, extractJson } from "./lib/llm.js";
import { runToolJson } from "./lib/run-tool.js";
import { hybridSearch } from "./lib/hybrid-search-fn.js";
import { semanticSearch } from "./lib/semantic-search-fn.js";
import { ftsSearch } from "./lib/fts-search-fn.js";
import { SYSTEM_CONFIG } from "./config.js";
import { buildHealthCheckNotification } from "./services/notifications/telegram.js";
import type {
  CommitInput,
  MaintenanceFinding,
  MaintenanceResult,
  MissingPage,
  MutationPlan,
  MutationResult,
  SearchResult,
  Severity,
  WikiDoc,
  WikiGraph
} from "./lib/contracts.js";

/**
 * Run deeper semantic and traceability validation over the wiki graph.
 * Also resolves broken wiki links by searching for candidate notes,
 * applies fixes, and emits a Telegram notification.
 */

interface LinkResolution {
  source_path: string;
  broken_target: string;
  candidate_path: string;
  candidate_title: string;
  score: number;
}

interface NewLinkCandidate {
  source_path: string;
  source_title: string;
  candidate_path: string;
  candidate_title: string;
  score: number;
}

interface SynonymCandidate {
  docA: WikiDoc;
  docB: WikiDoc;
  detectionMethod: "string" | "embedding" | "both";
  similarityScore: number;
}

interface SynonymVerdict {
  canonical_path: string;
  duplicate_path: string;
  reason: string;
}

interface SynonymMergeResult {
  candidates_found: number;
  confirmed: number;
  merges_applied: number;
  merged_pairs: Array<{ canonical: string; deleted: string }>;
  affected_paths: string[];
}

/**
 * Create a filesystem-safe timestamp used in report filenames.
 */
function nowStamp(): string {
  return new Date().toISOString().replaceAll(":", "-");
}

/**
 * Normalize a health-check finding into the shared maintenance result shape.
 */
function buildFinding(
  severity: Severity,
  targetPath: string,
  issueType: string,
  description: string,
  recommendedAction: string,
  autoFixable = false,
  extra: Record<string, unknown> = {}
): MaintenanceFinding {
  return {
    severity,
    path: targetPath,
    issue_type: issueType,
    description,
    recommended_action: recommendedAction,
    auto_fixable: autoFixable,
    ...extra
  };
}

/**
 * Sort findings by severity before path-level tie breaking.
 */
function severityRank(severity: Severity): number {
  return SYSTEM_CONFIG.maintenance.severityOrder[severity];
}

/**
 * Compute the age of a note in whole days from its updated timestamp.
 */
function ageInDays(updatedAt: string): number | null {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.floor((Date.now() - date.getTime()) / SYSTEM_CONFIG.health.dayInMs);
}

/**
 * Check whether a named markdown section exists and contains content.
 */
function sectionHasContent(doc: WikiDoc, sectionName: string): boolean {
  const section = doc.sectionMap.get(sectionName.toLowerCase());
  return Boolean(section && section.content.trim());
}

/**
 * Read an array-valued frontmatter field while discarding falsey entries.
 */
function frontmatterArray(doc: WikiDoc, key: string): unknown[] {
  const value = doc.frontmatter[key];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

/**
 * Decide whether a note has explicit or linked source support.
 */
function hasSourceSupport(doc: WikiDoc, graph: WikiGraph, docsByPath: Map<string, WikiDoc>): boolean {
  const [sourceIdsKey, sourceRefsKey] = SYSTEM_CONFIG.health.sourceSupportFrontmatterKeys;
  const explicitSourceIds = frontmatterArray(doc, sourceIdsKey);
  const explicitSourceRefs = frontmatterArray(doc, sourceRefsKey);
  const hasSourcesSection = sectionHasContent(doc, "Sources");
  const resolvedTargets = graph.resolvedLinks.get(doc.relativePath) || [];
  const linkedSourceDocs = resolvedTargets
    .map((target) => docsByPath.get(target))
    .filter((targetDoc) => targetDoc && targetDoc.docType === "source");

  return (
    explicitSourceIds.length > 0 ||
    explicitSourceRefs.length > 0 ||
    hasSourcesSection ||
    linkedSourceDocs.length > 0
  );
}

/**
 * Collapse broken-link data into unique missing-page targets.
 */
function collectMissingPages(graph: WikiGraph): MissingPage[] {
  const missing = new Map<string, MissingPage>();

  for (const [sourcePath, brokenLinks] of graph.brokenLinks.entries()) {
    for (const broken of brokenLinks) {
      const entry = missing.get(broken.normalized) || {
        target: broken.normalized,
        referenced_from: []
      };
      entry.referenced_from.push(sourcePath);
      missing.set(broken.normalized, entry);
    }
  }

  return Array.from(missing.values()).sort((a, b) => a.target.localeCompare(b.target));
}

/**
 * For each broken link, search the wiki for a candidate note that could resolve it.
 * Returns only candidates not already linked from the source doc.
 */
type SearchFn = (query: string, limit: number) => Promise<SearchResult>;

async function resolveBrokenLinks(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  searchFn: SearchFn,
  excludedPaths: Set<string>,
  log: ReturnType<typeof createLogger>
): Promise<LinkResolution[]> {
  const resolutions: LinkResolution[] = [];
  let totalBrokenLinks = 0;

  for (const doc of docs) {
    const broken = graph.brokenLinks.get(doc.relativePath) ?? [];
    totalBrokenLinks += broken.length;
  }

  log.info(
    { phase: "resolve-broken-links/start", total_broken_links: totalBrokenLinks },
    "health-check: [resolve-broken-links] starting link resolution search"
  );

  const alreadyResolved = new Set<string>(
    docs.flatMap((doc) => graph.resolvedLinks.get(doc.relativePath) ?? [])
  );

  for (const doc of docs) {
    const broken = graph.brokenLinks.get(doc.relativePath) ?? [];
    if (broken.length === 0) continue;

    const docResolvedPaths = new Set(graph.resolvedLinks.get(doc.relativePath) ?? []);

    for (const link of broken) {
      let searchResult: SearchResult;
      try {
        searchResult = await searchFn(link.normalized, 3);
      } catch (err) {
        log.warn(
          {
            phase: "resolve-broken-links/search",
            source_path: doc.relativePath,
            target: link.normalized,
            err: err instanceof Error ? err.message : String(err)
          },
          "health-check: [resolve-broken-links] search failed for target — skipping"
        );
        continue;
      }

      const top = searchResult.results[0];
      if (!top) {
        log.info(
          { phase: "resolve-broken-links/search", source_path: doc.relativePath, target: link.normalized, candidates: 0 },
          "health-check: [resolve-broken-links] no candidates found"
        );
        continue;
      }

      if (top.path === doc.relativePath || docResolvedPaths.has(top.path) || excludedPaths.has(top.path)) {
        log.info(
          {
            phase: "resolve-broken-links/search",
            source_path: doc.relativePath,
            target: link.normalized,
            candidate_path: top.path,
            skipped: top.path === doc.relativePath ? "self_link" : excludedPaths.has(top.path) ? "excluded_synonym" : "already_linked"
          },
          "health-check: [resolve-broken-links] candidate skipped"
        );
        continue;
      }

      log.info(
        {
          phase: "resolve-broken-links/search",
          source_path: doc.relativePath,
          target: link.normalized,
          candidate_path: top.path,
          candidate_title: top.title,
          score: top.score
        },
        "health-check: [resolve-broken-links] candidate found"
      );

      resolutions.push({
        source_path: doc.relativePath,
        broken_target: link.normalized,
        candidate_path: top.path,
        candidate_title: top.title,
        score: top.score
      });

      // Track to avoid duplicate resolutions for the same source+candidate pair
      docResolvedPaths.add(top.path);
    }
  }

  log.info(
    { phase: "resolve-broken-links/done", resolutions_found: resolutions.length },
    "health-check: [resolve-broken-links] link resolution search completed"
  );

  return resolutions;
}

/**
 * Apply a set of link additions (grouped by source_path) to the Related section of each doc.
 */
async function applyLinks(
  items: Array<{ source_path: string; candidate_path: string; candidate_title: string }>,
  planId: string,
  summary: string,
  phase: string,
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<MutationResult> {
  const bySource = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = bySource.get(item.source_path) ?? [];
    bucket.push(item);
    bySource.set(item.source_path, bucket);
  }

  const pageActions = Array.from(bySource.entries()).map(([sourcePath, group]) => {
    const links = group.map((item) => {
      const slug = item.candidate_path.split("/").pop()?.replace(/\.md$/, "") ?? item.candidate_path;
      return `[[${slug}|${item.candidate_title}]]`;
    });

    return {
      path: sourcePath,
      action: "update" as const,
      change_type: "link_addition",
      payload: {
        sections: {
          Related: links
        }
      }
    };
  });

  const plan: MutationPlan = {
    plan_id: planId,
    operation: "health-check",
    summary,
    source_refs: [],
    page_actions: pageActions,
    index_updates: [],
    post_actions: { reindex: false, commit: false }
  };

  log.info(
    { phase, plan_id: planId, page_actions: pageActions.length },
    `health-check: [${phase}] applying link mutations`
  );

  const result = await runToolJson<MutationResult>("apply-update", {
    vault: vaultRoot,
    input: plan
  });

  log.info(
    { phase, created: result.created.length, updated: result.updated.length, skipped: result.skipped.length },
    `health-check: [${phase}] mutations applied`
  );

  return result;
}

/**
 * Apply link resolutions (broken link fixes) to the Related section of each source doc.
 */
async function applyLinkResolutions(
  resolutions: LinkResolution[],
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<MutationResult> {
  return applyLinks(
    resolutions,
    `health-check-link-fix-${new Date().toISOString().slice(0, 10)}`,
    `Health check link resolutions: ${resolutions.length} link(s) resolved`,
    "apply-link-fixes",
    vaultRoot,
    log
  );
}

/**
 * Apply discovered new links to the Related section of each doc.
 */
async function applyDiscoveredLinks(
  candidates: NewLinkCandidate[],
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<MutationResult> {
  return applyLinks(
    candidates,
    `health-check-new-links-${new Date().toISOString().slice(0, 10)}`,
    `Health check new link discovery: ${candidates.length} link(s) added`,
    "apply-new-links",
    vaultRoot,
    log
  );
}

/**
 * For each typed doc, search the wiki for relevant notes not yet linked and return candidates.
 */
async function discoverNewLinks(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  searchFn: SearchFn,
  excludedPaths: Set<string>,
  log: ReturnType<typeof createLogger>,
  applyScoreFilter = false
): Promise<NewLinkCandidate[]> {
  const typedDocs = docs.filter((doc) => SYSTEM_CONFIG.wiki.typedDocTypes.includes(doc.docType) || doc.docType === "source");

  log.info(
    { phase: "discover-new-links/start", typed_docs: typedDocs.length },
    "health-check: [discover-new-links] starting new link discovery"
  );

  const candidates: NewLinkCandidate[] = [];

  for (const doc of typedDocs) {
    const resolvedPaths = new Set(graph.resolvedLinks.get(doc.relativePath) ?? []);

    let searchResult: SearchResult;
    try {
      searchResult = await searchFn(doc.title, 5);
    } catch (err) {
      log.warn(
        {
          phase: "discover-new-links/search",
          source_path: doc.relativePath,
          err: err instanceof Error ? err.message : String(err)
        },
        "health-check: [discover-new-links] search failed — skipping doc"
      );
      continue;
    }

    const minCosine = SYSTEM_CONFIG.enrich.minCosineSimilarity;

    for (const r of searchResult.results) {
      if (r.path === doc.relativePath) continue;
      log.info(
        {
          phase: "discover-new-links/score",
          source_path: doc.relativePath,
          candidate: r.path,
          score: r.score,
          threshold: applyScoreFilter ? minCosine : null,
          above_threshold: applyScoreFilter ? r.score >= minCosine : null,
          already_linked: resolvedPaths.has(r.path)
        },
        "health-check: [discover-new-links] candidate score"
      );
    }

    const newCandidates = searchResult.results
      .filter((r) => {
        if (r.path === doc.relativePath) return false;
        if (resolvedPaths.has(r.path)) return false;
        if (excludedPaths.has(r.path)) return false;
        if (applyScoreFilter && r.score < minCosine) return false;
        return true;
      })
      .slice(0, 3);

    if (newCandidates.length === 0) {
      log.info(
        { phase: "discover-new-links/search", source_path: doc.relativePath, new_candidates: 0 },
        "health-check: [discover-new-links] no new candidates found"
      );
      continue;
    }

    for (const candidate of newCandidates) {
      log.info(
        {
          phase: "discover-new-links/search",
          source_path: doc.relativePath,
          source_title: doc.title,
          candidate_path: candidate.path,
          candidate_title: candidate.title,
          score: candidate.score,
          threshold: applyScoreFilter ? minCosine : null
        },
        "health-check: [discover-new-links] new candidate found"
      );

      candidates.push({
        source_path: doc.relativePath,
        source_title: doc.title,
        candidate_path: candidate.path,
        candidate_title: candidate.title,
        score: candidate.score
      });

      // Track to avoid duplicates within the same doc
      resolvedPaths.add(candidate.path);
    }
  }

  log.info(
    { phase: "discover-new-links/done", candidates_found: candidates.length },
    "health-check: [discover-new-links] new link discovery completed"
  );

  return candidates;
}

/**
 * Render a short markdown summary that mirrors the JSON health-check result.
 */
function countApplied(r: Pick<MutationResult, "created" | "updated" | "skipped"> | null): number {
  return r ? r.updated.length + r.created.length : 0;
}

function renderSummary(
  result: MaintenanceResult & {
    missing_pages: MissingPage[];
    link_resolutions: LinkResolution[];
    discovered_links: NewLinkCandidate[];
    applied_link_fixes: Pick<MutationResult, "created" | "updated" | "skipped"> | null;
    applied_new_links: Pick<MutationResult, "created" | "updated" | "skipped"> | null;
  }
): string {
  const lines = [
    `# Health Check Report: ${result.run_id}`,
    "",
    `- Kind: \`${result.kind}\``,
    `- Files scanned: ${result.stats.docs}`,
    `- Findings: ${result.findings.length}`,
    `- Missing pages: ${result.missing_pages.length}`,
    `- Broken links resolved: ${result.link_resolutions.length} (applied: ${countApplied(result.applied_link_fixes)})`,
    `- New links discovered: ${result.discovered_links.length} (applied: ${countApplied(result.applied_new_links)})`,
    ""
  ];

  if (result.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("| Severity | Path | Issue | Action |");
    lines.push("|----------|------|-------|--------|");

    for (const finding of result.findings) {
      lines.push(
        `| ${finding.severity} | ${finding.path} | ${finding.issue_type} | ${finding.recommended_action} |`
      );
    }
  }

  if (result.missing_pages.length > 0) {
    lines.push("", "## Missing Pages");
    for (const item of result.missing_pages) {
      lines.push(`- ${item.target} <- ${item.referenced_from.join(", ")}`);
    }
  }

  if (result.link_resolutions.length > 0) {
    lines.push("", "## Broken Links Resolved");
    for (const r of result.link_resolutions) {
      lines.push(`- [[${r.broken_target}]] in ${r.source_path} → ${r.candidate_path} (score: ${r.score.toFixed(3)})`);
    }
  }

  if (result.discovered_links.length > 0) {
    lines.push("", "## New Links Discovered");
    for (const r of result.discovered_links) {
      lines.push(`- ${r.source_path} (${r.source_title}) → ${r.candidate_path} (${r.candidate_title}, score: ${r.score.toFixed(3)})`);
    }
  }

  return `${lines.join("\n")}\n`;
}

// ── Synonym concept detection helpers ─────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

async function detectSynonymConcepts(
  docs: WikiDoc[],
  vaultRoot: string,
  hasSemanticIndex: boolean,
  log: ReturnType<typeof createLogger>
): Promise<SynonymCandidate[]> {
  const { synonymSlugDistanceThreshold, synonymEmbeddingThreshold } = SYSTEM_CONFIG.health;
  const conceptDocs = docs.filter((d) => d.docType === "concept");

  if (conceptDocs.length < 2) return [];

  const map = new Map<string, SynonymCandidate>();

  // String heuristics
  for (let i = 0; i < conceptDocs.length; i++) {
    for (let j = i + 1; j < conceptDocs.length; j++) {
      const docA = conceptDocs[i];
      const docB = conceptDocs[j];
      const slugA = path.basename(docA.relativePath, ".md");
      const slugB = path.basename(docB.relativePath, ".md");
      const key = [slugA, slugB].sort().join(":::");

      const isPrefix = slugA.startsWith(slugB + "-") || slugB.startsWith(slugA + "-");
      const stemA = slugA.replace(/e?s$/, "");
      const stemB = slugB.replace(/e?s$/, "");
      const isPlural = stemA === stemB;
      const dist = levenshtein(slugA, slugB);
      const ratio = dist / Math.max(slugA.length, slugB.length);
      const isLev = ratio < synonymSlugDistanceThreshold;

      if (isPrefix || isPlural || isLev) {
        map.set(key, { docA, docB, detectionMethod: "string", similarityScore: 1 - ratio });
      }
    }
  }

  // Embedding heuristics
  if (hasSemanticIndex) {
    try {
      const manifest = await loadManifest(vaultRoot);
      const allUnits = await loadAllEmbeddingUnits(vaultRoot, manifest);
      const conceptPaths = new Set(conceptDocs.map((d) => d.relativePath));
      const conceptUnits = allUnits.filter((u) => {
        const p = u.id.split("#")[0];
        return conceptPaths.has(p);
      });

      for (let i = 0; i < conceptUnits.length; i++) {
        for (let j = i + 1; j < conceptUnits.length; j++) {
          const unitA = conceptUnits[i];
          const unitB = conceptUnits[j];
          const sim = cosineSimilarity(unitA.embedding, unitB.embedding);
          if (sim >= synonymEmbeddingThreshold) {
            const pathA = unitA.id.split("#")[0];
            const pathB = unitB.id.split("#")[0];
            const docA = conceptDocs.find((d) => d.relativePath === pathA);
            const docB = conceptDocs.find((d) => d.relativePath === pathB);
            if (!docA || !docB) continue;
            const slugA = path.basename(pathA, ".md");
            const slugB = path.basename(pathB, ".md");
            const key = [slugA, slugB].sort().join(":::");
            const existing = map.get(key);
            if (existing) {
              map.set(key, { ...existing, detectionMethod: "both", similarityScore: Math.max(existing.similarityScore, sim) });
            } else {
              map.set(key, { docA, docB, detectionMethod: "embedding", similarityScore: sim });
            }
          }
        }
      }
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "health-check: [synonym-detect] failed to load embedding index — skipping embedding heuristic"
      );
    }
  }

  const candidates = Array.from(map.values());
  log.info({ candidates: candidates.length }, "health-check: [synonym-detect] string/embedding candidates found");
  return candidates;
}

async function confirmSynonymsWithLLM(
  candidates: SynonymCandidate[],
  log: ReturnType<typeof createLogger>
): Promise<SynonymVerdict[]> {
  if (candidates.length === 0) return [];

  const batchSize = 20;
  const verdicts: SynonymVerdict[] = [];

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);

    const pairsText = batch
      .map((c, idx) => {
        const slugA = path.basename(c.docA.relativePath, ".md");
        const slugB = path.basename(c.docB.relativePath, ".md");
        const previewA = c.docA.sectionMap.get("facts")?.content.slice(0, 200) ?? c.docA.sectionMap.get("summary")?.content.slice(0, 200) ?? "";
        const previewB = c.docB.sectionMap.get("facts")?.content.slice(0, 200) ?? c.docB.sectionMap.get("summary")?.content.slice(0, 200) ?? "";
        return [
          `[${idx}]`,
          `Slug A: "${slugA}"`,
          `Título A: "${c.docA.title}"`,
          `Contenido A (preview): "${previewA.trim()}"`,
          ``,
          `Slug B: "${slugB}"`,
          `Título B: "${c.docB.title}"`,
          `Contenido B (preview): "${previewB.trim()}"`
        ].join("\n");
      })
      .join("\n\n");

    const messages = [
      {
        role: "system" as const,
        content:
          "Eres un asistente que evalúa si pares de conceptos biomédicos son sinónimos o duplicados. Responde SOLO con JSON válido, sin texto adicional."
      },
      {
        role: "user" as const,
        content: [
          "Evalúa los siguientes pares de notas de concepto. Para cada par devuelve si son el mismo",
          "concepto y cuál es la forma canónica (la más simple/corta/sin siglas).",
          "",
          'Responde con un objeto JSON: { "verdicts": [ { "pair_index": number, "is_synonym": boolean, "canonical_slug": string, "reason": string } ] }',
          "",
          "Pares:",
          pairsText
        ].join("\n")
      }
    ];

    try {
      const response = await chatCompletion({ messages, temperature: 0 });
      const raw = extractJson(chatText(response, "synonym-confirm")) as {
        verdicts: Array<{ pair_index: number; is_synonym: boolean; canonical_slug: string; reason: string }>;
      };

      for (const v of raw.verdicts ?? []) {
        if (!v.is_synonym) continue;
        const candidate = batch[v.pair_index];
        if (!candidate) continue;

        const slugA = path.basename(candidate.docA.relativePath, ".md");
        const slugB = path.basename(candidate.docB.relativePath, ".md");

        let canonicalDoc: WikiDoc;
        let duplicateDoc: WikiDoc;

        if (v.canonical_slug === slugA) {
          canonicalDoc = candidate.docA;
          duplicateDoc = candidate.docB;
        } else if (v.canonical_slug === slugB) {
          canonicalDoc = candidate.docB;
          duplicateDoc = candidate.docA;
        } else {
          log.warn(
            { canonical_slug: v.canonical_slug, slugA, slugB },
            "health-check: [synonym-confirm] canonical_slug doesn't match either doc — skipping"
          );
          continue;
        }

        verdicts.push({
          canonical_path: canonicalDoc.relativePath,
          duplicate_path: duplicateDoc.relativePath,
          reason: v.reason
        });
      }
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "health-check: [synonym-confirm] LLM call failed — skipping batch"
      );
    }
  }

  return verdicts;
}

async function applySynonymMerges(
  verdicts: SynonymVerdict[],
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<SynonymMergeResult> {
  const result: SynonymMergeResult = {
    candidates_found: 0,
    confirmed: verdicts.length,
    merges_applied: 0,
    merged_pairs: [],
    affected_paths: []
  };

  if (verdicts.length === 0) return result;

  const docsByPath = new Map(docs.map((d) => [d.relativePath, d]));
  const { synonymMergeableSections } = SYSTEM_CONFIG.health;

  // Resolve merge chains: if A→B and B→C, then A→C
  const canonicalOf = new Map<string, string>();
  for (const v of verdicts) {
    canonicalOf.set(v.duplicate_path, v.canonical_path);
  }
  function resolveCanonical(p: string): string {
    const seen = new Set<string>();
    let cur = p;
    while (canonicalOf.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = canonicalOf.get(cur)!;
    }
    return cur;
  }

  for (const verdict of verdicts) {
    const canonicalPath = resolveCanonical(verdict.canonical_path);
    const dupPath = verdict.duplicate_path;

    const canonDoc = docsByPath.get(canonicalPath);
    const dupDoc = docsByPath.get(dupPath);

    if (!canonDoc || !dupDoc) {
      log.warn({ canonical_path: canonicalPath, duplicate_path: dupPath }, "health-check: [synonym-merge] doc not found — skipping");
      continue;
    }

    // Build merged sections — use LLM to deduplicate where both docs have content
    const sections: Record<string, string | string[]> = {};
    const sectionsWithOverlap: Array<{ name: string; canonical: string; duplicate: string }> = [];
    const sectionsOnlyInDup: Array<{ name: string; content: string }> = [];

    for (const sectionName of synonymMergeableSections) {
      const canonSec = canonDoc.sectionMap.get(sectionName.toLowerCase())?.content.trim() ?? "";
      const dupSec = dupDoc.sectionMap.get(sectionName.toLowerCase())?.content.trim() ?? "";
      if (canonSec && dupSec) {
        sectionsWithOverlap.push({ name: sectionName, canonical: canonSec, duplicate: dupSec });
      } else if (dupSec) {
        sectionsOnlyInDup.push({ name: sectionName, content: dupSec });
      }
    }

    // Sections only in duplicate: add directly, nothing to deduplicate
    for (const { name, content } of sectionsOnlyInDup) {
      sections[name] = content;
    }

    // Sections with overlap: one LLM call to deduplicate all of them at once
    if (sectionsWithOverlap.length > 0) {
      const sectionBlocks = sectionsWithOverlap
        .map(
          ({ name, canonical, duplicate }) =>
            `### ${name}\n\nCanónico:\n${canonical}\n\nDuplicado:\n${duplicate}`
        )
        .join("\n\n---\n\n");

      const mergeMessages = [
        {
          role: "system" as const,
          content:
            "Eres un editor científico. Tu tarea es fusionar secciones de dos notas de concepto que son sinónimos, eliminando información redundante y conservando todo lo único de cada una. Responde SOLO con JSON válido, sin texto adicional."
        },
        {
          role: "user" as const,
          content: [
            `Fusiona las siguientes secciones del concepto canónico "${canonDoc.title}" absorbiendo el duplicado "${dupDoc.title}".`,
            "Para cada sección, produce un único bloque de texto unificado en markdown, sin repetir hechos.",
            "",
            `Responde con: { "sections": { "<NombreSeccion>": "<contenido fusionado>" } }`,
            "",
            sectionBlocks
          ].join("\n")
        }
      ];

      try {
        const mergeResponse = await chatCompletion({ messages: mergeMessages, temperature: 0 });
        const mergeRaw = extractJson(chatText(mergeResponse, "synonym-section-merge")) as {
          sections: Record<string, string>;
        };
        for (const { name } of sectionsWithOverlap) {
          const merged = mergeRaw.sections?.[name];
          if (merged?.trim()) {
            sections[name] = merged.trim();
          }
        }
      } catch (err) {
        log.warn(
          { canonical_path: canonicalPath, duplicate_path: dupPath, err: err instanceof Error ? err.message : String(err) },
          "health-check: [synonym-merge] LLM section merge failed — falling back to concatenation"
        );
        // Fallback: append duplicate content below canonical
        for (const { name, canonical, duplicate } of sectionsWithOverlap) {
          sections[name] = `${canonical}\n\n${duplicate}`;
        }
      }
    }

    // Merge source_ids and source_refs frontmatter arrays
    const canonSourceIds = Array.isArray(canonDoc.frontmatter.source_ids) ? (canonDoc.frontmatter.source_ids as unknown[]) : [];
    const dupSourceIds = Array.isArray(dupDoc.frontmatter.source_ids) ? (dupDoc.frontmatter.source_ids as unknown[]) : [];
    const canonSourceRefs = Array.isArray(canonDoc.frontmatter.source_refs) ? (canonDoc.frontmatter.source_refs as unknown[]) : [];
    const dupSourceRefs = Array.isArray(dupDoc.frontmatter.source_refs) ? (dupDoc.frontmatter.source_refs as unknown[]) : [];

    const mergedSourceIds = [...new Set([...canonSourceIds, ...dupSourceIds])];
    const mergedSourceRefs = [...new Set([...canonSourceRefs, ...dupSourceRefs])];

    const frontmatter: Record<string, unknown> = {};
    if (mergedSourceIds.length > 0) frontmatter.source_ids = mergedSourceIds;
    if (mergedSourceRefs.length > 0) frontmatter.source_refs = mergedSourceRefs;

    const plan = {
      plan_id: `synonym-merge-${path.basename(canonicalPath, ".md")}-${Date.now()}`,
      operation: "health-check",
      summary: `Synonym merge: absorb ${dupPath} into ${canonicalPath}`,
      source_refs: [],
      page_actions: [
        {
          path: canonicalPath,
          action: "update" as const,
          change_type: "content_merge",
          payload: {
            ...(Object.keys(sections).length > 0 ? { sections } : {}),
            ...(Object.keys(frontmatter).length > 0 ? { frontmatter } : {})
          }
        }
      ],
      index_updates: [],
      post_actions: { reindex: false, commit: false }
    };

    try {
      await runToolJson("apply-update", { vault: vaultRoot, input: plan });
      log.info({ canonical_path: canonicalPath, duplicate_path: dupPath }, "health-check: [synonym-merge] content merged");
    } catch (err) {
      log.warn(
        { canonical_path: canonicalPath, duplicate_path: dupPath, err: err instanceof Error ? err.message : String(err) },
        "health-check: [synonym-merge] apply-update failed — skipping merge"
      );
      continue;
    }

    // Rewrite incoming links that point to the duplicate
    const dupSlug = path.basename(dupPath, ".md");
    const canonSlug = path.basename(canonicalPath, ".md");

    for (const doc of docs) {
      const hasLink = doc.wikiLinks.some((l) => l.normalized === dupSlug);
      if (!hasLink) continue;

      const fullPath = path.join(vaultRoot, doc.relativePath);
      try {
        let content = await fs.readFile(fullPath, "utf-8");
        // Replace [[dupSlug|...]] and [[dupSlug]]
        content = content.replace(new RegExp(`\\[\\[${dupSlug}\\|([^\\]]+)\\]\\]`, "g"), `[[${canonSlug}|$1]]`);
        content = content.replace(new RegExp(`\\[\\[${dupSlug}\\]\\]`, "g"), `[[${canonSlug}]]`);
        await fs.writeFile(fullPath, content, "utf-8");
        result.affected_paths.push(doc.relativePath);
        log.info({ doc: doc.relativePath, from: dupSlug, to: canonSlug }, "health-check: [synonym-merge] link rewritten");
      } catch (err) {
        log.warn(
          { doc: doc.relativePath, err: err instanceof Error ? err.message : String(err) },
          "health-check: [synonym-merge] failed to rewrite link"
        );
      }
    }

    // Delete the duplicate
    try {
      await fs.unlink(path.join(vaultRoot, dupPath));
      log.info({ duplicate_path: dupPath }, "health-check: [synonym-merge] duplicate deleted");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn(
          { duplicate_path: dupPath, err: err instanceof Error ? err.message : String(err) },
          "health-check: [synonym-merge] failed to delete duplicate"
        );
      }
    }

    result.merges_applied++;
    result.merged_pairs.push({ canonical: canonicalPath, deleted: dupPath });
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("health-check");
  const vaultRoot = resolveVaultRoot(args.vault);

  log.info({ phase: "startup", vault_root: vaultRoot }, "health-check: started");

  const docs = await loadWikiDocs(vaultRoot);
  const graph = analyzeWikiGraph(docs);
  const docsByPath = new Map(docs.map((doc) => [doc.relativePath, doc]));

  const totalBrokenLinks = Array.from(graph.brokenLinks.values()).reduce((sum, arr) => sum + arr.length, 0);

  log.info(
    {
      phase: "analyze-graph",
      docs: docs.length,
      alias_map_size: graph.aliasMap.size,
      total_broken_links: totalBrokenLinks,
      ambiguous_targets: Array.from(graph.ambiguousTargets.values()).reduce((sum, arr) => sum + arr.length, 0)
    },
    "health-check: [analyze-graph] wiki graph analyzed"
  );

  const findings: MaintenanceFinding[] = [];

  // ── per-doc checks ────────────────────────────────────────────────────────

  log.info({ phase: "check-docs", docs: docs.length }, "health-check: [check-docs] running per-doc checks");

  for (const doc of docs) {
    if (doc.docType === "unknown") {
      findings.push(
        buildFinding(
          "critical",
          doc.relativePath,
          "unknown_doc_type",
          "The note type could not be inferred from frontmatter or folder placement.",
          "Add an explicit type in frontmatter or move the note into a typed wiki folder."
        )
      );
    }

    if (SYSTEM_CONFIG.wiki.typedDocTypes.includes(doc.docType)) {
      const hasEvidenceLikeSection = SYSTEM_CONFIG.health.evidenceLikeSections.some((sectionName) =>
        sectionHasContent(doc, sectionName)
      );

      if (hasEvidenceLikeSection && !hasSourceSupport(doc, graph, docsByPath)) {
        findings.push(
          buildFinding(
            "critical",
            doc.relativePath,
            "unsupported_claims",
            "The note contains factual or evidentiary content without visible source support.",
            "Add source references or downgrade unsupported claims to open questions."
          )
        );
      }
    }

    if (doc.docType === "analysis" && !sectionHasContent(doc, "Evidence")) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "analysis_without_evidence",
          "The analysis note has no Evidence section with content.",
          "Add evidence with source support or demote the note from durable analysis status."
        )
      );
    }

    if (doc.docType === "source") {
      const sourceRefKey = SYSTEM_CONFIG.health.requiredSourceFrontmatter.sourceRef;
      const capturedAtKey = SYSTEM_CONFIG.health.requiredSourceFrontmatter.capturedAt;

      if (typeof doc.frontmatter[sourceRefKey] !== "string" || !doc.frontmatter[sourceRefKey].trim()) {
        findings.push(
          buildFinding(
            "warning",
            doc.relativePath,
            "source_missing_ref",
            "The source note has no source_ref in frontmatter.",
            "Add the raw source reference path or identifier."
          )
        );
      }

      if (typeof doc.frontmatter[capturedAtKey] !== "string" || !doc.frontmatter[capturedAtKey].trim()) {
        findings.push(
          buildFinding(
            "suggestion",
            doc.relativePath,
            "source_missing_capture_time",
            "The source note has no captured_at timestamp.",
            "Add the capture timestamp for traceability."
          )
        );
      }
    }

    if (
      typeof doc.frontmatter.confidence === "string" &&
      doc.frontmatter.confidence.trim().toLowerCase() === SYSTEM_CONFIG.health.lowConfidenceValue
    ) {
      const age = ageInDays(doc.updatedAt);
      if (age !== null && age > SYSTEM_CONFIG.health.staleLowConfidenceCriticalDays) {
        findings.push(
          buildFinding(
            "critical",
            doc.relativePath,
            "stale_low_confidence_note",
            `The note is low confidence and has not been reviewed for ${age} days.`,
            "Review the note, improve evidence, or archive it."
          )
        );
      } else if (age !== null && age > SYSTEM_CONFIG.health.staleLowConfidenceWarningDays) {
        findings.push(
          buildFinding(
            "warning",
            doc.relativePath,
            "stale_low_confidence_note",
            `The note is low confidence and has not been reviewed for ${age} days.`,
            "Review the note soon and either strengthen or remove the weak content."
          )
        );
      }
    }

    if (doc.docType === "topic" && !sectionHasContent(doc, "Key Concepts") && !sectionHasContent(doc, "Key Entities")) {
      findings.push(
        buildFinding(
          "suggestion",
          doc.relativePath,
          "topic_missing_structure",
          "The topic note does not list key concepts or key entities.",
          "Add key links so the topic works as a hub rather than a loose summary."
        )
      );
    }
  }

  const missingPages = collectMissingPages(graph);
  for (const item of missingPages) {
    findings.push(
      buildFinding(
        "warning",
        item.referenced_from[0],
        "missing_page",
        `The knowledge base references a missing page target: ${item.target}.`,
        "Create the missing page if the concept is real, or remove the unresolved link.",
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

  // ── broken link resolution ─────────────────────────────────────────────────

  const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));

  // Broken-link resolution: hybrid (title/name matching benefits from lexical signal)
  const searchFn: SearchFn = hasSemanticIndex
    ? (query, limit) => hybridSearch(query, { vault: vaultRoot, limit })
    : (query, limit) => ftsSearch(query, { vault: vaultRoot, limit });

  // Related-link discovery: semantic only (cosine similarity has stable absolute meaning)
  const discoverSearchFn: SearchFn = hasSemanticIndex
    ? (query, limit) => semanticSearch(query, { vault: vaultRoot, limit })
    : (query, limit) => ftsSearch(query, { vault: vaultRoot, limit });

  log.info(
    { phase: "resolve-broken-links/start", has_semantic_index: hasSemanticIndex },
    "health-check: [resolve-broken-links] starting broken link resolution"
  );

  const linkResolutions = await resolveBrokenLinks(docs, graph, vaultRoot, searchFn, new Set(), log);

  // ── apply link resolutions ─────────────────────────────────────────────────

  let appliedLinkFixes: Pick<MutationResult, "created" | "updated" | "skipped"> | null = null;

  if (linkResolutions.length > 0) {
    const mutationResult = await applyLinkResolutions(linkResolutions, vaultRoot, log);
    appliedLinkFixes = {
      created: mutationResult.created,
      updated: mutationResult.updated,
      skipped: mutationResult.skipped
    };
  }

  // ── synonym concept detection & merge ────────────────────────────────────

  log.info({ phase: "synonym-detect/start" }, "health-check: [synonym-detect] detecting synonym concepts");

  const synonymCandidates = await detectSynonymConcepts(docs, vaultRoot, hasSemanticIndex, log);
  const synonymVerdicts = await confirmSynonymsWithLLM(synonymCandidates, log);
  const synonymMergeResult = await applySynonymMerges(synonymVerdicts, docs, graph, vaultRoot, log);

  log.info(
    { phase: "synonym-detect/done", ...synonymMergeResult },
    "health-check: [synonym-detect] synonym merge complete"
  );

  // ── discover new links ────────────────────────────────────────────────────

  log.info(
    { phase: "discover-new-links/start" },
    "health-check: [discover-new-links] starting new link discovery"
  );

  const deletedSynonymPaths = new Set(synonymMergeResult.merged_pairs.map((p) => p.deleted));
  const discoveredLinks = await discoverNewLinks(docs, graph, vaultRoot, discoverSearchFn, deletedSynonymPaths, log, hasSemanticIndex);

  // ── apply discovered links ────────────────────────────────────────────────

  let appliedNewLinks: Pick<MutationResult, "created" | "updated" | "skipped"> | null = null;

  if (discoveredLinks.length > 0) {
    const mutationResult = await applyDiscoveredLinks(discoveredLinks, vaultRoot, log);
    appliedNewLinks = {
      created: mutationResult.created,
      updated: mutationResult.updated,
      skipped: mutationResult.skipped
    };
  }

  // ── reindex + commit if any links were applied ────────────────────────────

  const allAffected = [
    ...(appliedLinkFixes?.updated ?? []),
    ...(appliedLinkFixes?.created ?? []),
    ...(appliedNewLinks?.updated ?? []),
    ...(appliedNewLinks?.created ?? []),
    ...synonymMergeResult.affected_paths,
    ...synonymMergeResult.merged_pairs.map((p) => p.canonical),
    ...synonymMergeResult.merged_pairs.map((p) => p.deleted)
  ];
  const uniqueAffected = [...new Set(allAffected)];

  if (uniqueAffected.length > 0) {
    log.info({ phase: "reindex", affected: uniqueAffected.length }, "health-check: [reindex] rebuilding search index");
    await runToolJson("reindex", { vault: vaultRoot });
    log.info({ phase: "reindex" }, "health-check: [reindex] index rebuilt");

    const fixCount = countApplied(appliedLinkFixes);
    const newCount = countApplied(appliedNewLinks);
    const commitInput: CommitInput = {
      operation: "health-check",
      summary: `Health check: ${fixCount} broken link(s) resolved, ${newCount} new link(s) added, ${synonymMergeResult.merges_applied} synonym merge(s)`,
      source_refs: [],
      affected_notes: uniqueAffected,
      paths_to_stage: [...uniqueAffected, SYSTEM_CONFIG.paths.dbPath],
      feedback_record_ref: null,
      mutation_result_ref: null,
      commit_message: `health-check: ${fixCount} broken + ${newCount} new link(s) + ${synonymMergeResult.merges_applied} synonym merge(s) applied`
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
    link_resolutions: linkResolutions,
    applied_link_fixes: appliedLinkFixes,
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
  const appliedNewCount = countApplied(appliedNewLinks);

  const telegramFields = buildHealthCheckNotification({
    run_id: runId,
    stats: statsObj,
    missing_pages: missingPages.length,
    link_resolutions: linkResolutions.length,
    applied_fixes: appliedFixCount,
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
      link_resolutions: linkResolutions.length,
      applied_fixes: appliedFixCount,
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
