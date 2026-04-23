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
import { analyzeWikiGraph, loadWikiDocs, extractWikiLinks } from "./lib/wiki-inspect.js";
import { parseSections } from "./lib/markdown.js";
import { loadManifest, loadAllEmbeddingUnits, cosineSimilarity, manifestPath, normalizeTextForEmbedding, extractSummarySection, hashText } from "./lib/semantic-index.js";
import type { EmbeddingUnit } from "./lib/semantic-index.js";
import { chatCompletion, chatText } from "./lib/llm.js";
import { runToolJson } from "./lib/run-tool.js";
import { hybridSearch } from "./lib/hybrid-search-fn.js";
import { ftsSearch } from "./lib/fts-search-fn.js";
import { getGitHead } from "./lib/git.js";
import { SYSTEM_CONFIG, resolvedConceptTopicCandidateThreshold } from "./config.js";
import { buildHealthCheckNotification } from "./services/notifications/telegram.js";
import { generateRenamePlan } from "./rename-plan.js";
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
 * Reports broken wiki links, searches for candidate resolutions, and emits a
 * Telegram notification. Broken links are never fixed automatically.
 */

interface BrokenLinkReport {
  source_path: string;
  raw_target: string;
  normalized_target: string;
}

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
 * Flatten broken-link data so reports and notifications can show the concrete
 * unresolved links, not only unique missing-page aggregates.
 */
function collectBrokenLinks(graph: WikiGraph, log: ReturnType<typeof createLogger>): BrokenLinkReport[] {
  const brokenLinks: BrokenLinkReport[] = [];

  for (const [sourcePath, links] of graph.brokenLinks.entries()) {
    for (const link of links) {
      const item = {
        source_path: sourcePath,
        raw_target: link.raw,
        normalized_target: link.normalized
      };
      brokenLinks.push(item);
      log.warn(
        { phase: "broken-links/report", ...item },
        "health-check: [broken-links] unresolved wikilink found"
      );
    }
  }

  return brokenLinks.sort((a, b) =>
    `${a.source_path}:${a.normalized_target}`.localeCompare(`${b.source_path}:${b.normalized_target}`)
  );
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
    "health-check: [resolve-broken-links] starting link resolution suggestion search"
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
            skipped: top.path === doc.relativePath ? "self_link" : excludedPaths.has(top.path) ? "excluded_path" : "already_linked"
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
    "health-check: [resolve-broken-links] link resolution suggestion search completed"
  );

  return resolutions;
}

/**
 * For each typed doc, find Related links whose cosine similarity to the source
 * doc is below `minCosineSimilarity` and return them grouped for removal.
 * Requires the semantic index to be present — skips silently if not.
 */
async function pruneWeakRelatedLinks(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  log: ReturnType<typeof createLogger>,
  embeddingMap: Map<string, number[]>
): Promise<Array<{ path: string; links_to_remove: string[] }>> {
  if (embeddingMap.size === 0) return [];

  const minCosine = SYSTEM_CONFIG.enrich.minCosineSimilarity;
  const typedDocTypes = new Set([...SYSTEM_CONFIG.wiki.typedDocTypes, "source"]);
  const results: Array<{ path: string; links_to_remove: string[] }> = [];

  for (const doc of docs) {
    if (!typedDocTypes.has(doc.docType)) continue;

    const sourceEmbedding = embeddingMap.get(doc.relativePath);
    if (!sourceEmbedding) continue;

    const relatedSection =
      doc.sectionMap.get("Related") ?? doc.sectionMap.get("related") ?? null;
    if (!relatedSection) continue;

    const relatedLinks = extractWikiLinks(relatedSection.content);
    const linksToRemove: string[] = [];

    for (const link of relatedLinks) {
      const candidates = graph.aliasMap.get(link.normalized) ?? [];
      if (candidates.length !== 1) continue;
      const targetPath = candidates[0];

      // Self-links always have cosine similarity 1.0 and would never be pruned
      // by the score threshold — remove them explicitly.
      if (targetPath === doc.relativePath) {
        linksToRemove.push(`[[${link.raw}]]`);
        continue;
      }

      const targetEmbedding = embeddingMap.get(targetPath);
      if (!targetEmbedding) continue;

      const similarity = cosineSimilarity(sourceEmbedding, targetEmbedding);

      log.debug(
        {
          phase: "prune-related/score",
          source: doc.relativePath,
          target: targetPath,
          score: similarity,
          threshold: minCosine,
          will_prune: similarity < minCosine
        },
        "health-check: [prune-related] link score"
      );

      if (similarity < minCosine) {
        linksToRemove.push(`[[${link.raw}]]`);
      }
    }

    if (linksToRemove.length > 0) {
      log.info(
        { phase: "prune-related/result", path: doc.relativePath, removing: linksToRemove.length },
        "health-check: [prune-related] weak links to remove"
      );
      results.push({ path: doc.relativePath, links_to_remove: linksToRemove });
    }
  }

  return results;
}

/**
 * Apply link pruning: remove weak Related links from each affected doc.
 */
async function applyLinkPruning(
  pruneList: Array<{ path: string; links_to_remove: string[] }>,
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<MutationResult> {
  const pageActions: MutationPlan["page_actions"] = pruneList.map(({ path: docPath, links_to_remove }) => ({
    path: docPath,
    action: "update",
    change_type: "link_pruning",
    payload: { sections_remove: { Related: links_to_remove } }
  }));

  const plan: MutationPlan = {
    plan_id: `health-check-prune-${new Date().toISOString().slice(0, 10)}`,
    operation: "manual",
    summary: `health-check: pruning weak Related links in ${pageActions.length} doc(s)`,
    source_refs: [],
    page_actions: pageActions,
    index_updates: [],
    post_actions: { reindex: false, commit: false }
  };

  log.info({ phase: "prune-related/apply", page_actions: pageActions.length }, "health-check: [prune-related] applying pruning mutations");

  return runToolJson<MutationResult>("apply-update", { vault: vaultRoot, input: plan });
}

/**
 * Sanitize Related sections across all typed docs: expand multi-link inline
 * bullets, remove self-links, and deduplicate by slug. Does not require the
 * semantic index. Returns docs that were actually modified.
 */
async function sanitizeRelatedSections(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<string[]> {
  const typedDocTypes = new Set([...SYSTEM_CONFIG.wiki.typedDocTypes, "source"]);
  const pageActions: MutationPlan["page_actions"] = [];

  for (const doc of docs) {
    if (!typedDocTypes.has(doc.docType)) continue;

    const relatedSection =
      doc.sectionMap.get("Related") ?? doc.sectionMap.get("related") ?? null;
    if (!relatedSection) continue;

    // Extract all individual wikilinks (handles multi-link inline bullets)
    const allLinks = extractWikiLinks(relatedSection.content);
    if (allLinks.length === 0) continue;

    // Resolve doc's own slug for self-link detection
    const docSlug = doc.relativePath.split("/").pop()?.replace(/\.md$/, "") ?? "";

    const seen = new Set<string>();
    const cleanLinks: string[] = [];

    for (const link of allLinks) {
      // Broken link (target does not exist): skip
      const candidates = graph.aliasMap.get(link.normalized) ?? [];
      if (candidates.length === 0) continue;

      // Self-link: skip
      const isSelf =
        link.normalized === docSlug ||
        candidates.includes(doc.relativePath);
      if (isSelf) continue;

      // Deduplicate by normalized slug
      if (seen.has(link.normalized)) continue;
      seen.add(link.normalized);

      cleanLinks.push(`[[${link.raw}]]`);
    }

    // Check if anything actually changed
    const currentRaw = allLinks.map((l) => `[[${l.raw}]]`);
    const changed =
      currentRaw.length !== cleanLinks.length ||
      currentRaw.some((l, i) => l !== cleanLinks[i]);

    if (!changed) continue;

    log.info(
      {
        phase: "sanitize-related",
        path: doc.relativePath,
        before: currentRaw.length,
        after: cleanLinks.length
      },
      "health-check: [sanitize-related] rebuilding Related section"
    );

    // sections_remove clears all existing links; sections re-adds the clean list.
    // (sections_remove runs before sections in applyMarkdownPayload)
    pageActions.push({
      path: doc.relativePath,
      action: "update",
      change_type: "link_pruning",
      payload: {
        sections_remove: { Related: currentRaw },
        sections: cleanLinks.length > 0 ? { Related: cleanLinks } : {}
      }
    });
  }

  if (pageActions.length === 0) return [];

  const plan: MutationPlan = {
    plan_id: `health-check-sanitize-${new Date().toISOString().slice(0, 10)}`,
    operation: "manual",
    summary: `health-check: sanitizing Related sections in ${pageActions.length} doc(s)`,
    source_refs: [],
    page_actions: pageActions,
    index_updates: [],
    post_actions: { reindex: false, commit: false }
  };

  const result = await runToolJson<MutationResult>("apply-update", { vault: vaultRoot, input: plan });
  return result.updated;
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
 * For each typed doc, find wiki notes not yet linked with cosine similarity >= threshold
 * using the stored document embeddings from the semantic index (same cosim values used
 * by pruneWeakRelatedLinks, avoiding the title-query vs full-doc embedding mismatch).
 *
 * Topic docs (wiki/topics/) are included as source documents: automation may and should
 * update their Related sections.  What automation must never do is CREATE new topic files —
 * that restriction lives in apply-update.ts (hard guard) and guardrail-plan.ts, not here.
 */
async function discoverNewLinks(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  excludedPaths: Set<string>,
  log: ReturnType<typeof createLogger>,
  units: EmbeddingUnit[],
  embeddingMap: Map<string, number[]>
): Promise<NewLinkCandidate[]> {
  if (units.length === 0) return [];



  const typedDocs = docs.filter((doc) => SYSTEM_CONFIG.wiki.typedDocTypes.includes(doc.docType) || doc.docType === "source");
  const minCosine = SYSTEM_CONFIG.enrich.minCosineSimilarity;

  log.info(
    { phase: "discover-new-links/start", typed_docs: typedDocs.length },
    "health-check: [discover-new-links] starting new link discovery"
  );

  const candidates: NewLinkCandidate[] = [];

  for (const doc of typedDocs) {
    const sourceEmbedding = embeddingMap.get(doc.relativePath);
    if (!sourceEmbedding) continue;

    const resolvedPaths = new Set(graph.resolvedLinks.get(doc.relativePath) ?? []);

    // Also track normalized slugs of ALL links in Related (resolved or broken).
    // upsertSection deduplicates by text, so a broken link already in the section
    // would produce no content change — the mutation would be skipped.
    const relatedSection = doc.sectionMap.get("Related") ?? doc.sectionMap.get("related");
    const existingRelatedSlugs = new Set<string>(
      relatedSection ? extractWikiLinks(relatedSection.content).map((l) => l.normalized) : []
    );

    // Score all indexed docs using stored embeddings (same cosim as pruneWeakRelatedLinks)
    const scored: Array<{ path: string; title: string; score: number }> = [];
    for (const unit of units) {
      if (unit.path === doc.relativePath) continue;
      if (resolvedPaths.has(unit.path)) continue;
      if (excludedPaths.has(unit.path)) continue;
      const score = cosineSimilarity(sourceEmbedding, unit.embedding);
      if (score < minCosine) continue;
      const candidateSlug = unit.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
      if (existingRelatedSlugs.has(candidateSlug)) continue;

      log.debug(
        {
          phase: "discover-new-links/score",
          source_path: doc.relativePath,
          candidate: unit.path,
          score,
          threshold: minCosine
        },
        "health-check: [discover-new-links] candidate score"
      );

      scored.push({ path: unit.path, title: unit.title, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const newCandidates = scored.slice(0, 3);

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
          threshold: minCosine
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
    broken_links: BrokenLinkReport[];
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
    `- Broken links reported: ${result.broken_links.length}`,
    `- Broken link resolution suggestions: ${result.link_resolutions.length}`,
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

  if (result.broken_links.length > 0) {
    lines.push("", "## Broken Links");
    for (const item of result.broken_links) {
      lines.push(`- [[${item.raw_target}]] in ${item.source_path}`);
    }
  }

  if (result.link_resolutions.length > 0) {
    lines.push("", "## Broken Link Resolution Suggestions");
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

/**
 * Call the LLM to produce a concise Summary for a wiki note.
 * The prompt is given the full note body and asked to return only the summary text.
 */
async function generateSummaryText(doc: WikiDoc): Promise<string | null> {
  const body = doc.raw.replace(/^---[\s\S]*?---\n?/, "").trim();
  const maxBody = 6000; // send at most 6000 chars to the LLM to keep costs bounded
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
async function applySummaryFixes(
  candidates: Array<{ doc: WikiDoc; normalizedChars: number }>,
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
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
async function hasStaleEmbeddings(vaultRoot: string, docs: WikiDoc[]): Promise<boolean> {
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
  const docsByPath = new Map(docs.map((doc) => [doc.relativePath, doc]));

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

  const findings: MaintenanceFinding[] = [];
  const summaryNeeded: Array<{ doc: WikiDoc; normalizedChars: number }> = [];
  const summaryMisplaced: WikiDoc[] = [];

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

    // ── missing Summary check ─────────────────────────────────────────────────
    // Notes whose normalised text exceeds maxInputChars cannot be fully
    // represented by the embedding model.  A ## Summary section acts as a
    // curated, length-bounded representation used during semantic indexing.
    const normalizedForCheck = normalizeTextForEmbedding(doc.raw);
    const exceedsLimit = normalizedForCheck.length > SYSTEM_CONFIG.semantic.maxInputChars;
    const hasSummary = sectionHasContent(doc, "Summary");
    const isSummaryTarget =
      doc.relativePath.startsWith("wiki/concepts/") || doc.relativePath.startsWith("wiki/sources/");

    if (exceedsLimit && !hasSummary) {
      if (isSummaryTarget) {
        summaryNeeded.push({ doc, normalizedChars: normalizedForCheck.length });
      } else {
        // For other doc types: emit a warning but don't auto-fix.
        findings.push(
          buildFinding(
            "warning",
            doc.relativePath,
            "missing_summary",
            `The note's normalised text (${normalizedForCheck.length} chars) exceeds the embedding limit (${SYSTEM_CONFIG.semantic.maxInputChars} chars) but has no ## Summary section. The embedding will be truncated, reducing semantic search quality.`,
            `Add a ## Summary section (up to ${SYSTEM_CONFIG.semantic.summaryMaxLength} chars) with a concise description of the note's key content.`,
            false,
            { normalized_chars: normalizedForCheck.length, max_input_chars: SYSTEM_CONFIG.semantic.maxInputChars }
          )
        );
      }
    }

    // ── Summary position check ────────────────────────────────────────────────
    // Summary must appear immediately after the # Title, before any preamble
    // content or other ## sections.  Two failure cases:
    //   A) summaryIdx > 0 — other ## sections appear before Summary
    //   B) summaryIdx === 0 but preamble is non-empty — body content sits between
    //      the H1 and the Summary heading (e.g. tables, H3 subsections)
    if (hasSummary) {
      const summaryIdx = doc.sections.findIndex((s) => s.name.toLowerCase() === "summary");
      const { body } = { body: doc.body ?? doc.raw.replace(/^---[\s\S]*?---\n?/, "") };
      const parsed = parseSections(body);
      const hasPreamble = parsed.preamble.trim().length > 0;

      if (summaryIdx > 0 || hasPreamble) {
        summaryMisplaced.push(doc);
      }
    }
  }

  // ── concept-topic-candidate check ─────────────────────────────────────────

  const conceptTopicThreshold = resolvedConceptTopicCandidateThreshold();
  for (const doc of docs) {
    if (doc.docType !== "concept") continue;
    const outbound = doc.wikiLinks.length;
    const inbound = graph.inboundCounts.get(doc.relativePath) ?? 0;
    const totalLinks = outbound + inbound;
    if (totalLinks > conceptTopicThreshold) {
      findings.push(
        buildFinding(
          "suggestion",
          doc.relativePath,
          "concept-topic-candidate",
          `The concept has ${totalLinks} wikilinks (${outbound} outbound, ${inbound} inbound), above the threshold of ${conceptTopicThreshold}. It may be broad enough to become a topic.`,
          "Consider manually converting this concept to a topic under wiki/topics/ if it acts as a hub for other notes.",
          false,
          { total_links: totalLinks, outbound_links: outbound, inbound_links: inbound, threshold: conceptTopicThreshold }
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
  // A touch mutation (empty payload) is enough: renderMarkdown enforces
  // Summary-first ordering on every render pass.

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

    const plan: MutationPlan = {
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
      await runToolJson("apply-update", { vault: vaultRoot, input: plan });
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
    // Reload docs and graph so subsequent phases see the pruned state
    docs = excludeProjects(await loadWikiDocs(vaultRoot));
    graph = analyzeWikiGraph(docs);
  }

  log.info(
    { phase: "prune-related/done", docs_affected: weakLinks.length },
    "health-check: [prune-related] weak link pruning complete"
  );

  // ── broken link reporting and resolution suggestions ───────────────────────

  const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));

  // Broken-link suggestions: hybrid (title/name matching benefits from lexical signal)
  const searchFn: SearchFn = hasSemanticIndex
    ? (query, limit) => hybridSearch(query, { vault: vaultRoot, limit })
    : (query, limit) => ftsSearch(query, { vault: vaultRoot, limit });

  log.info(
    { phase: "resolve-broken-links/start", has_semantic_index: hasSemanticIndex },
    "health-check: [resolve-broken-links] starting broken link suggestion search"
  );

  const linkResolutions = await resolveBrokenLinks(docs, graph, vaultRoot, searchFn, new Set(), log);

  // Broken links are report-only. Suggestions are emitted for review, but no
  // mutation plan is applied for them.
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
