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
import { analyzeWikiGraph, extractWikiLinks, loadWikiDocs } from "./lib/wiki-inspect.js";
import { splitFrontmatter, stringifyFrontmatter } from "./lib/frontmatter.js";
import { SYSTEM_CONFIG } from "./config.js";
import type { MaintenanceFinding, MaintenanceResult, Severity, WikiDoc, WikiGraph } from "./lib/contracts.js";

/**
 * Run structural wiki linting and optionally persist the report artifacts.
 */

/**
 * Create a filesystem-safe timestamp used in report filenames.
 *
 * @returns {string}
 */
function nowStamp(): string {
  return new Date().toISOString().replaceAll(":", "-");
}

/**
 * Normalize a lint finding into the shared maintenance result shape.
 *
 * @param {"critical" | "warning" | "suggestion"} severity
 * @param {string} targetPath
 * @param {string} issueType
 * @param {string} description
 * @param {string} recommendedAction
 * @param {boolean} [autoFixable=false]
 * @param {Record<string, any>} [extra={}]
 * @returns {Record<string, any>}
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
 *
 * @param {string} severity
 * @returns {number}
 */
function severityRank(severity: Severity): number {
  return SYSTEM_CONFIG.maintenance.severityOrder[severity];
}

/**
 * Enforce lowercase kebab-case names for stable linking and maintenance.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
function isKebabCaseName(relativePath: string): boolean {
  const stem = path.posix.basename(relativePath, SYSTEM_CONFIG.wiki.markdownExtension);
  return SYSTEM_CONFIG.lint.kebabCasePattern.test(stem);
}

/**
 * Report required frontmatter keys that are missing or empty.
 *
 * @param {{ frontmatter: Record<string, any> }} doc
 * @returns {string[]}
 */
function missingRequiredFrontmatter(doc: WikiDoc): string[] {
  return SYSTEM_CONFIG.wiki.requiredFrontmatterKeys.filter((key) => {
    const value = doc.frontmatter[key];
    return typeof value !== "string" || !value.trim();
  });
}

/**
 * Return the raw tag values from frontmatter as a string array.
 */
function currentTagsRaw(doc: WikiDoc): string[] {
  const value = doc.frontmatter.tags;
  if (Array.isArray(value)) {
    return value.filter((t): t is string => typeof t === "string" && Boolean(t.trim())).map((t) => t.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}


/**
 * Walk the "Linked Notes" section of a source doc, resolve wiki links against
 * the graph, and return the full list of slugs for docs in wiki/topics/*.
 * Returns null when the section is absent or contains no resolvable topic links.
 */
function topicTagsFromLinkedNotes(
  doc: WikiDoc,
  graph: WikiGraph,
  docsByPath: Map<string, WikiDoc>
): string[] | null {
  const section = doc.sectionMap.get("linked notes");
  if (!section || !section.content.trim()) return null;

  const links = extractWikiLinks(section.content);
  if (links.length === 0) return null;

  const slugs: string[] = [];

  for (const link of links) {
    const matches = graph.aliasMap.get(link.normalized) ?? [];
    if (matches.length !== 1) continue; // broken or ambiguous — skip
    const targetPath = matches[0];
    const targetDoc = docsByPath.get(targetPath);
    if (!targetDoc || targetDoc.docType !== "topic") continue;
    slugs.push(path.posix.basename(targetPath, ".md"));
  }

  return slugs.length > 0 ? slugs : null;
}

/**
 * Find basename collisions that can make wiki link resolution ambiguous.
 *
 * @param {{ relativePath: string }[]} docs
 * @returns {Array<[string, string[]]>}
 */
function buildAliasCollisions(docs: WikiDoc[]): Array<[string, string[]]> {
  const basenameMap = new Map<string, string[]>();

  for (const doc of docs) {
    const base = path.posix.basename(doc.relativePath, ".md");
    const bucket = basenameMap.get(base) || [];
    bucket.push(doc.relativePath);
    basenameMap.set(base, bucket);
  }

  return Array.from(basenameMap.entries()).filter(([, matches]) => matches.length > 1);
}

/**
 * Render a short markdown summary that mirrors the JSON lint result.
 *
 * @param {{ run_id: string, kind: string, findings: Record<string, any>[], stats: { docs: number } }} result
 * @returns {string}
 */
function renderSummary(result: MaintenanceResult): string {
  const lines = [
    `# Lint Report: ${result.run_id}`,
    "",
    `- Kind: \`${result.kind}\``,
    `- Files scanned: ${result.stats.docs}`,
    `- Findings: ${result.findings.length}`,
    ""
  ];

  if (result.findings.length === 0) {
    lines.push("No findings.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Severity | Path | Issue | Action |");
  lines.push("|----------|------|-------|--------|");

  for (const finding of result.findings) {
    lines.push(
      `| ${finding.severity} | ${finding.path} | ${finding.issue_type} | ${finding.recommended_action} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("lint");
  const vaultRoot = resolveVaultRoot(args.vault);
  log.info("lint started");
  const docs = (await loadWikiDocs(vaultRoot)).filter(
    (d) => !d.relativePath.startsWith("wiki/projects/")
  );
  const graph = analyzeWikiGraph(docs);
  const docsByPath = new Map(docs.map((doc) => [doc.relativePath, doc]));
  const findings: MaintenanceFinding[] = [];

  for (const doc of docs) {
    if (doc.lineCount > SYSTEM_CONFIG.lint.lineCriticalThreshold) {
      findings.push(
        buildFinding(
          "critical",
          doc.relativePath,
          "oversized_page",
          `The page has ${doc.lineCount} lines and is far above the preferred note size.`,
          "Split the page into smaller notes and leave the original as a hub."
        )
      );
    } else if (doc.lineCount > SYSTEM_CONFIG.lint.lineWarningThreshold) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "oversized_page",
          `The page has ${doc.lineCount} lines and exceeds the preferred note size.`,
          "Consider splitting the page into smaller reusable notes."
        )
      );
    }

    if (doc.sectionCount > SYSTEM_CONFIG.lint.sectionWarningThreshold) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "too_many_sections",
          `The page has ${doc.sectionCount} top-level sections.`,
          "Review the structure and split the note if it covers too many separate ideas."
        )
      );
    }

    const missingKeys = missingRequiredFrontmatter(doc);
    if (missingKeys.length > 0 && doc.docType !== "index") {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "incomplete_frontmatter",
          `The page is missing required frontmatter keys: ${missingKeys.join(", ")}.`,
          "Add the missing frontmatter fields to keep indexing and maintenance predictable.",
          false,
          { missing_keys: missingKeys }
        )
      );
    }

    if (doc.docType === "source") {
      const computedTags = topicTagsFromLinkedNotes(doc, graph, docsByPath);
      const existingTags = currentTagsRaw(doc);

      if (computedTags !== null) {
        findings.push(
          buildFinding(
            "warning",
            doc.relativePath,
            "source_tags_outdated",
            `The source note tags will be recalculated from Linked Notes topics: ${computedTags.join(", ")}.`,
            "Tags are always overwritten to match the Linked Notes topics.",
            true,
            { computed_tags: computedTags, existing_tags: existingTags }
          )
        );
      } else if (existingTags.length === 0) {
        findings.push(
          buildFinding(
            "warning",
            doc.relativePath,
            "source_missing_tags",
            "The source note has no tags and no resolvable topic links in the Linked Notes section.",
            "Add topic links to the Linked Notes section so tags can be derived automatically."
          )
        );
      }
    }

    if (!isKebabCaseName(doc.relativePath)) {
      findings.push(
        buildFinding(
          "suggestion",
          doc.relativePath,
          "inconsistent_name",
          "The file name is not lowercase kebab-case.",
          "Rename the file to lowercase kebab-case for consistent linking and maintenance."
        )
      );
    }

    const brokenLinks = graph.brokenLinks.get(doc.relativePath) || [];
    if (brokenLinks.length > 0) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "broken_links",
          `The page contains unresolved wiki links: ${brokenLinks.map((item) => item.raw).join(", ")}.`,
          "Fix the broken links or create the missing target notes.",
          false,
          { targets: brokenLinks.map((item) => item.normalized) }
        )
      );
    }

    const ambiguousLinks = graph.ambiguousTargets.get(doc.relativePath) || [];
    if (ambiguousLinks.length > 0) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "ambiguous_links",
          `The page contains ambiguous wiki links: ${ambiguousLinks.map((item) => item.raw).join(", ")}.`,
          "Use more specific link targets or resolve duplicate note names.",
          false,
          { targets: ambiguousLinks.map((item) => item.matches).flat() }
        )
      );
    }

    const inboundCount = graph.inboundCounts.get(doc.relativePath) || 0;
    if (SYSTEM_CONFIG.wiki.typedDocTypes.includes(doc.docType) && inboundCount === 0) {
      findings.push(
        buildFinding(
          "warning",
          doc.relativePath,
          "orphan_page",
          "The page has no inbound wiki links.",
          "Link this note from at least one related page or index."
        )
      );
    }

    if (doc.docType === "index" && doc.wikiLinks.length === 0) {
      findings.push(
        buildFinding(
          "suggestion",
          doc.relativePath,
          "empty_index",
          "The index page contains no wiki links.",
          "Populate the index page with links to relevant notes."
        )
      );
    }
  }

  const aliasCollisions = buildAliasCollisions(docs);
  for (const [base, matches] of aliasCollisions) {
    findings.push(
      buildFinding(
        "warning",
        matches.join(", "),
        "duplicate_basename",
        `Multiple notes share the same basename "${base}".`,
        "Rename the notes so wiki links resolve unambiguously.",
        false,
        { matches }
      )
    );
  }

  if (!(await pathExists(resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.rootIndexPath)))) {
    findings.push(
      buildFinding(
        "warning",
        SYSTEM_CONFIG.paths.rootIndexPath,
        "missing_root_index",
        "The root INDEX.md file is missing.",
        "Create and maintain a root index page for navigation."
      )
    );
  }

  findings.sort((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return `${left.path}:${left.issue_type}`.localeCompare(`${right.path}:${right.issue_type}`);
  });

  const result: MaintenanceResult = {
    run_id: `lint-${new Date().toISOString().slice(0, 10)}`,
    kind: "lint",
    stats: {
      docs: docs.length,
      findings: findings.length,
      critical: findings.filter((item) => item.severity === "critical").length,
      warning: findings.filter((item) => item.severity === "warning").length,
      suggestion: findings.filter((item) => item.severity === "suggestion").length
    },
    findings
  };

  // ── auto-fix: overwrite tags from Linked Notes topics ────────────────────

  const fixableFindings = findings.filter(
    (f) => f.auto_fixable && f.issue_type === "source_tags_outdated"
  );
  let fixedTagsCount = 0;

  for (const finding of fixableFindings) {
    const doc = docsByPath.get(finding.path);
    if (!doc) continue;

    const computedTags = finding.computed_tags as string[];
    const { frontmatter, body } = splitFrontmatter(doc.raw);
    frontmatter.tags = computedTags;
    const fixed = `${stringifyFrontmatter(frontmatter)}${body}`.trimEnd() + "\n";

    await writeTextFile(doc.absolutePath, fixed);
    fixedTagsCount += 1;

    log.info(
      { path: finding.path, tags: computedTags },
      "lint: [auto-fix] tags overwritten from Linked Notes topics"
    );
  }

  // ── write report artifacts ────────────────────────────────────────────────

  if (args.write) {
    const stamp = nowStamp();
    const reportDir = resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.maintenanceDir);
    const reportPath = resolveWithinRoot(vaultRoot, `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-lint.json`);
    const summaryPath = resolveWithinRoot(vaultRoot, `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-lint.md`);
    await ensureDirectory(reportDir);
    await writeJsonFile(reportPath, result);
    await writeTextFile(summaryPath, renderSummary(result));
    result.report_path = `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-lint.json`;
    result.summary_path = `${SYSTEM_CONFIG.paths.maintenanceDir}/${stamp}-lint.md`;
  }

  log.info(
    { docs: result.stats.docs, findings: result.stats.findings, critical: result.stats.critical, fixed_tags: fixedTagsCount },
    "lint completed"
  );
  writeJsonStdout({ ...result, fixed_tags_count: fixedTagsCount }, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
