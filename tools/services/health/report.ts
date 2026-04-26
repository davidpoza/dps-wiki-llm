import { buildFinding } from "../../lib/core/maintenance.js";
import type { MaintenanceResult, MissingPage, MutationResult } from "../../lib/core/contracts.js";
import type { BrokenLinkReport, LinkResolution, NewLinkCandidate } from "./link-ops.js";

export { buildFinding };

export type HealthCheckReportInput = MaintenanceResult & {
  missing_pages: MissingPage[];
  broken_links: BrokenLinkReport[];
  link_resolutions: LinkResolution[];
  discovered_links: NewLinkCandidate[];
  applied_link_fixes: Pick<MutationResult, "created" | "updated" | "skipped"> | null;
  applied_new_links: Pick<MutationResult, "created" | "updated" | "skipped"> | null;
};

export function countApplied(r: Pick<MutationResult, "created" | "updated" | "skipped"> | null): number {
  return r ? r.updated.length + r.created.length : 0;
}

export function renderSummary(result: HealthCheckReportInput): string {
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
