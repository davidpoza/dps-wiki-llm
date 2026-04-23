import { cosineSimilarity } from "../../lib/semantic-index.js";
import type { EmbeddingUnit } from "../../lib/semantic-index.js";
import { runToolJson } from "../../lib/run-tool.js";
import { extractWikiLinks } from "../../lib/wiki-inspect.js";
import { SYSTEM_CONFIG } from "../../config.js";
import type { MissingPage, MutationPlan, MutationResult, SearchResult, WikiDoc, WikiGraph } from "../../lib/contracts.js";
import type { Logger } from "pino";

export type BrokenLinkReport = {
  source_path: string;
  raw_target: string;
  normalized_target: string;
};

export type LinkResolution = {
  source_path: string;
  broken_target: string;
  candidate_path: string;
  candidate_title: string;
  score: number;
};

export type NewLinkCandidate = {
  source_path: string;
  source_title: string;
  candidate_path: string;
  candidate_title: string;
  score: number;
};

export type SearchFn = (query: string, limit: number) => Promise<SearchResult>;

/**
 * Collapse broken-link data into unique missing-page targets.
 */
export function collectMissingPages(graph: WikiGraph): MissingPage[] {
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
export function collectBrokenLinks(graph: WikiGraph, log: Logger): BrokenLinkReport[] {
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
 * Searches are parallelized with a concurrency limit of 4.
 * Returns only candidates not already linked from the source doc.
 */
export async function resolveBrokenLinks(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  searchFn: SearchFn,
  excludedPaths: Set<string>,
  log: Logger
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

  // Collect all search tasks
  type SearchTask = {
    doc: WikiDoc;
    link: { raw: string; normalized: string };
    docResolvedPaths: Set<string>;
  };

  const tasks: SearchTask[] = [];
  for (const doc of docs) {
    const broken = graph.brokenLinks.get(doc.relativePath) ?? [];
    if (broken.length === 0) continue;
    const docResolvedPaths = new Set(graph.resolvedLinks.get(doc.relativePath) ?? []);
    for (const link of broken) {
      tasks.push({ doc, link, docResolvedPaths });
    }
  }

  // Process tasks with concurrency limit of 4
  const CONCURRENCY = 4;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ doc, link, docResolvedPaths }) => {
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
          return null;
        }

        const top = searchResult.results[0];
        if (!top) {
          log.info(
            { phase: "resolve-broken-links/search", source_path: doc.relativePath, target: link.normalized, candidates: 0 },
            "health-check: [resolve-broken-links] no candidates found"
          );
          return null;
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
          return null;
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

        // Track to avoid duplicate resolutions for the same source+candidate pair
        docResolvedPaths.add(top.path);

        return {
          source_path: doc.relativePath,
          broken_target: link.normalized,
          candidate_path: top.path,
          candidate_title: top.title,
          score: top.score
        } satisfies LinkResolution;
      })
    );

    for (const r of results) {
      if (r) resolutions.push(r);
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
export async function pruneWeakRelatedLinks(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  log: Logger,
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
export async function applyLinkPruning(
  pruneList: Array<{ path: string; links_to_remove: string[] }>,
  vaultRoot: string,
  log: Logger
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
export async function sanitizeRelatedSections(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  log: Logger
): Promise<string[]> {
  const typedDocTypes = new Set([...SYSTEM_CONFIG.wiki.typedDocTypes, "source"]);
  const pageActions: MutationPlan["page_actions"] = [];

  for (const doc of docs) {
    if (!typedDocTypes.has(doc.docType)) continue;

    const relatedSection =
      doc.sectionMap.get("Related") ?? doc.sectionMap.get("related") ?? null;
    if (!relatedSection) continue;

    const allLinks = extractWikiLinks(relatedSection.content);
    if (allLinks.length === 0) continue;

    const docSlug = doc.relativePath.split("/").pop()?.replace(/\.md$/, "") ?? "";

    const seen = new Set<string>();
    const cleanLinks: string[] = [];

    for (const link of allLinks) {
      const candidates = graph.aliasMap.get(link.normalized) ?? [];
      if (candidates.length === 0) continue;

      const isSelf =
        link.normalized === docSlug ||
        candidates.includes(doc.relativePath);
      if (isSelf) continue;

      if (seen.has(link.normalized)) continue;
      seen.add(link.normalized);

      cleanLinks.push(`[[${link.raw}]]`);
    }

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

async function applyLinks(
  items: Array<{ source_path: string; candidate_path: string; candidate_title: string }>,
  planId: string,
  summary: string,
  phase: string,
  vaultRoot: string,
  log: Logger
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
export async function applyDiscoveredLinks(
  candidates: NewLinkCandidate[],
  vaultRoot: string,
  log: Logger
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
 * using the stored document embeddings from the semantic index.
 *
 * Topic docs (wiki/topics/) are included as source documents: automation may and should
 * update their Related sections. What automation must never do is CREATE new topic files —
 * that restriction lives in apply-update.ts (hard guard) and guardrail-plan.ts, not here.
 */
export async function discoverNewLinks(
  docs: WikiDoc[],
  graph: WikiGraph,
  vaultRoot: string,
  excludedPaths: Set<string>,
  log: Logger,
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

    const relatedSection = doc.sectionMap.get("Related") ?? doc.sectionMap.get("related");
    const existingRelatedSlugs = new Set<string>(
      relatedSection ? extractWikiLinks(relatedSection.content).map((l) => l.normalized) : []
    );

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

      resolvedPaths.add(candidate.path);
    }
  }

  log.info(
    { phase: "discover-new-links/done", candidates_found: candidates.length },
    "health-check: [discover-new-links] new link discovery completed"
  );

  return candidates;
}
