#!/usr/bin/env node

import path from "node:path";

import { parseArgs, writeJsonStdout } from "./lib/cli.mjs";
import {
  ensureDirectory,
  pathExists,
  resolveVaultRoot,
  resolveWithinRoot,
  writeJsonFile,
  writeTextFile
} from "./lib/fs-utils.mjs";
import { analyzeWikiGraph, loadWikiDocs } from "./lib/wiki-inspect.mjs";

/**
 * Run structural wiki linting and optionally persist the report artifacts.
 */

/**
 * Create a filesystem-safe timestamp used in report filenames.
 *
 * @returns {string}
 */
function nowStamp() {
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
function buildFinding(severity, targetPath, issueType, description, recommendedAction, autoFixable = false, extra = {}) {
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
function severityRank(severity) {
  if (severity === "critical") {
    return 0;
  }

  if (severity === "warning") {
    return 1;
  }

  return 2;
}

/**
 * Enforce lowercase kebab-case names for stable linking and maintenance.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
function isKebabCaseName(relativePath) {
  const stem = path.posix.basename(relativePath, ".md");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem);
}

/**
 * Report required frontmatter keys that are missing or empty.
 *
 * @param {{ frontmatter: Record<string, any> }} doc
 * @returns {string[]}
 */
function hasRequiredFrontmatter(doc) {
  const keys = ["type", "title", "updated"];
  return keys.filter((key) => {
    const value = doc.frontmatter[key];
    return typeof value !== "string" || !value.trim();
  });
}

/**
 * Find basename collisions that can make wiki link resolution ambiguous.
 *
 * @param {{ relativePath: string }[]} docs
 * @returns {Array<[string, string[]]>}
 */
function buildAliasCollisions(docs) {
  const basenameMap = new Map();

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
function renderSummary(result) {
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

async function main() {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const docs = await loadWikiDocs(vaultRoot);
  const graph = analyzeWikiGraph(docs);
  const findings = [];

  for (const doc of docs) {
    if (doc.lineCount > 500) {
      findings.push(
        buildFinding(
          "critical",
          doc.relativePath,
          "oversized_page",
          `The page has ${doc.lineCount} lines and is far above the preferred note size.`,
          "Split the page into smaller notes and leave the original as a hub."
        )
      );
    } else if (doc.lineCount > 300) {
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

    if (doc.sectionCount > 12) {
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

    const missingKeys = hasRequiredFrontmatter(doc);
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
    if (["concept", "entity", "topic", "analysis"].includes(doc.docType) && inboundCount === 0) {
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

  if (!(await pathExists(resolveWithinRoot(vaultRoot, "INDEX.md")))) {
    findings.push(
      buildFinding(
        "warning",
        "INDEX.md",
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

  const result = {
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

  if (args.write) {
    const stamp = nowStamp();
    const reportDir = resolveWithinRoot(vaultRoot, "state/maintenance");
    const reportPath = resolveWithinRoot(vaultRoot, `state/maintenance/${stamp}-lint.json`);
    const summaryPath = resolveWithinRoot(vaultRoot, `state/maintenance/${stamp}-lint.md`);
    await ensureDirectory(reportDir);
    await writeJsonFile(reportPath, result);
    await writeTextFile(summaryPath, renderSummary(result));
    result.report_path = "state/maintenance/" + `${stamp}-lint.json`;
    result.summary_path = "state/maintenance/" + `${stamp}-lint.md`;
  }

  writeJsonStdout(result, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
