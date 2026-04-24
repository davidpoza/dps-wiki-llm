import { parseSections } from "../../lib/wiki/markdown.js";
import { normalizeTextForEmbedding } from "../../lib/storage/semantic-index.js";
import { buildFinding } from "../../lib/core/maintenance.js";
import { SYSTEM_CONFIG, resolvedConceptTopicCandidateThreshold } from "../../config.js";
import type { MaintenanceFinding, WikiDoc, WikiGraph } from "../../lib/core/contracts.js";

function ageInDays(updatedAt: string): number | null {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.floor((Date.now() - date.getTime()) / SYSTEM_CONFIG.health.dayInMs);
}

function sectionHasContent(doc: WikiDoc, sectionName: string): boolean {
  const section = doc.sectionMap.get(sectionName.toLowerCase());
  return Boolean(section && section.content.trim());
}

function frontmatterArray(doc: WikiDoc, key: string): unknown[] {
  const value = doc.frontmatter[key];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

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

export type PerDocCheckResult = {
  findings: MaintenanceFinding[];
  summaryNeeded: Array<{ doc: WikiDoc; normalizedChars: number }>;
  summaryMisplaced: WikiDoc[];
};

export function runPerDocChecks(
  docs: WikiDoc[],
  graph: WikiGraph
): PerDocCheckResult {
  const docsByPath = new Map(docs.map((doc) => [doc.relativePath, doc]));
  const findings: MaintenanceFinding[] = [];
  const summaryNeeded: Array<{ doc: WikiDoc; normalizedChars: number }> = [];
  const summaryMisplaced: WikiDoc[] = [];

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

    // Missing Summary check
    const normalizedForCheck = normalizeTextForEmbedding(doc.raw);
    const exceedsLimit = normalizedForCheck.length > SYSTEM_CONFIG.semantic.maxInputChars;
    const hasSummary = sectionHasContent(doc, "Summary");
    const isSummaryTarget =
      doc.relativePath.startsWith("wiki/concepts/") || doc.relativePath.startsWith("wiki/sources/");

    if (exceedsLimit && !hasSummary) {
      if (isSummaryTarget) {
        summaryNeeded.push({ doc, normalizedChars: normalizedForCheck.length });
      } else {
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

    // Summary position check
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

  // Concept-topic-candidate check
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

  return { findings, summaryNeeded, summaryMisplaced };
}
