#!/usr/bin/env node

import { parseArgs, writeJsonStdout } from "./lib/cli.mjs";
import {
  ensureDirectory,
  resolveVaultRoot,
  resolveWithinRoot,
  writeJsonFile,
  writeTextFile
} from "./lib/fs-utils.mjs";
import { analyzeWikiGraph, loadWikiDocs } from "./lib/wiki-inspect.mjs";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function nowStamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

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

function severityRank(severity) {
  if (severity === "critical") {
    return 0;
  }

  if (severity === "warning") {
    return 1;
  }

  return 2;
}

function ageInDays(updatedAt) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.floor((Date.now() - date.getTime()) / DAY_IN_MS);
}

function sectionHasContent(doc, sectionName) {
  const section = doc.sectionMap.get(sectionName.toLowerCase());
  return Boolean(section && section.content.trim());
}

function frontmatterArray(doc, key) {
  const value = doc.frontmatter[key];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function hasSourceSupport(doc, graph, docsByPath) {
  const explicitSourceIds = frontmatterArray(doc, "source_ids");
  const explicitSourceRefs = frontmatterArray(doc, "source_refs");
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

function collectMissingPages(graph) {
  const missing = new Map();

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

function renderSummary(result) {
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

async function main() {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const docs = await loadWikiDocs(vaultRoot);
  const graph = analyzeWikiGraph(docs);
  const docsByPath = new Map(docs.map((doc) => [doc.relativePath, doc]));
  const findings = [];

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

    if (["concept", "entity", "topic", "analysis"].includes(doc.docType)) {
      const hasEvidenceLikeSection =
        sectionHasContent(doc, "Facts") || sectionHasContent(doc, "Evidence") || sectionHasContent(doc, "Extracted Claims");

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
      if (typeof doc.frontmatter.source_ref !== "string" || !doc.frontmatter.source_ref.trim()) {
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

      if (typeof doc.frontmatter.captured_at !== "string" || !doc.frontmatter.captured_at.trim()) {
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

    if (typeof doc.frontmatter.confidence === "string" && doc.frontmatter.confidence.trim().toLowerCase() === "low") {
      const age = ageInDays(doc.updatedAt);
      if (age !== null && age > 90) {
        findings.push(
          buildFinding(
            "critical",
            doc.relativePath,
            "stale_low_confidence_note",
            `The note is low confidence and has not been reviewed for ${age} days.`,
            "Review the note, improve evidence, or archive it."
          )
        );
      } else if (age !== null && age > 30) {
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

  const result = {
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
    const reportDir = resolveWithinRoot(vaultRoot, "state/maintenance");
    const reportPath = resolveWithinRoot(vaultRoot, `state/maintenance/${stamp}-health-check.json`);
    const summaryPath = resolveWithinRoot(vaultRoot, `state/maintenance/${stamp}-health-check.md`);
    await ensureDirectory(reportDir);
    await writeJsonFile(reportPath, result);
    await writeTextFile(summaryPath, renderSummary(result));
    result.report_path = "state/maintenance/" + `${stamp}-health-check.json`;
    result.summary_path = "state/maintenance/" + `${stamp}-health-check.md`;
  }

  writeJsonStdout(result, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
