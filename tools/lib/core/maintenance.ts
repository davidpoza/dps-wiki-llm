/**
 * Shared maintenance utilities used by lint.ts and health-check.ts.
 */

import { SYSTEM_CONFIG } from "../../config.js";
import type { MaintenanceFinding, Severity } from "./contracts.js";

export function nowStamp(): string {
  return new Date().toISOString().replaceAll(":", "-");
}

export function buildFinding(
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

export function severityRank(severity: Severity): number {
  return SYSTEM_CONFIG.maintenance.severityOrder[severity];
}
