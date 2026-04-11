#!/usr/bin/env node

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import {
  ensureDirectory,
  resolveVaultRoot,
  resolveWithinRoot,
  writeJsonFile,
  writeTextFile
} from "./lib/fs-utils.js";
import { analyzeWikiGraph, loadWikiDocs } from "./lib/wiki-inspect.js";
import { SYSTEM_CONFIG } from "./config.js";
import type { MaintenanceFinding, MaintenanceResult, MissingPage, Severity, WikiDoc, WikiGraph } from "./lib/contracts.js";

/**
 * Run deeper semantic and traceability validation over the wiki graph.
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
 * Normalize a health-check finding into the shared maintenance result shape.
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
 * Compute the age of a note in whole days from its updated timestamp.
 *
 * @param {string} updatedAt
 * @returns {number | null}
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
 *
 * @param {{ sectionMap: Map<string, { content: string }> }} doc
 * @param {string} sectionName
 * @returns {boolean}
 */
function sectionHasContent(doc: WikiDoc, sectionName: string): boolean {
  const section = doc.sectionMap.get(sectionName.toLowerCase());
  return Boolean(section && section.content.trim());
}

/**
 * Read an array-valued frontmatter field while discarding falsey entries.
 *
 * @param {{ frontmatter: Record<string, any> }} doc
 * @param {string} key
 * @returns {any[]}
 */
function frontmatterArray(doc: WikiDoc, key: string): unknown[] {
  const value = doc.frontmatter[key];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

/**
 * Decide whether a note has explicit or linked source support.
 *
 * @param {{ frontmatter: Record<string, any>, relativePath: string }} doc
 * @param {{
 *   resolvedLinks: Map<string, string[]>
 * }} graph
 * @param {Map<string, { docType: string }>} docsByPath
 * @returns {boolean}
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
 *
 * @param {{ brokenLinks: Map<string, { normalized: string }[]> }} graph
 * @returns {Array<{ target: string, referenced_from: string[] }>}
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
 * Render a short markdown summary that mirrors the JSON health-check result.
 *
 * @param {{
 *   run_id: string,
 *   kind: string,
 *   findings: Record<string, any>[],
 *   missing_pages: Array<{ target: string, referenced_from: string[] }>,
 *   stats: { docs: number }
 * }} result
 * @returns {string}
 */
function renderSummary(result: MaintenanceResult & { missing_pages: MissingPage[] }): string {
  const lines = [
    `# Health Check Report: ${result.run_id}`,
    "",
    `- Kind: \`${result.kind}\``,
    `- Files scanned: ${result.stats.docs}`,
    `- Findings: ${result.findings.length}`,
    `- Missing pages: ${result.missing_pages.length}`,
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

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const docs = await loadWikiDocs(vaultRoot);
  const graph = analyzeWikiGraph(docs);
  const docsByPath = new Map(docs.map((doc) => [doc.relativePath, doc]));
  const findings: MaintenanceFinding[] = [];

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

  findings.sort((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return `${left.path}:${left.issue_type}`.localeCompare(`${right.path}:${right.issue_type}`);
  });

  const result: MaintenanceResult & { missing_pages: MissingPage[] } = {
    run_id: `health-check-${new Date().toISOString().slice(0, 10)}`,
    kind: "health-check",
    stats: {
      docs: docs.length,
      findings: findings.length,
      critical: findings.filter((item) => item.severity === "critical").length,
      warning: findings.filter((item) => item.severity === "warning").length,
      suggestion: findings.filter((item) => item.severity === "suggestion").length
    },
    findings,
    missing_pages: missingPages
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

  writeJsonStdout(result, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
