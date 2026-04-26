import path from "node:path";

import { mergeFrontmatter, splitFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { SYSTEM_CONFIG } from "../../config.js";
import type { MarkdownPayload, MarkdownSection, ParsedMarkdown, RenderRuntime } from "../core/contracts.js";

const BULLET_SECTIONS = new Set<string>(SYSTEM_CONFIG.markdown.bulletSections);

/**
 * Markdown parsing and rendering helpers for deterministic note updates.
 */

/**
 * Normalize a line for duplicate detection while preserving semantic content.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Extract all wikilink slugs from a string (the part before `|` or the full
 * target if no alias). Used to compare links by target regardless of alias.
 *
 * @param {string} value
 * @returns {string[]}
 */
function extractWikilinkSlugs(value: string): string[] {
  const matches = [...value.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  return matches.map((m) => m[1].trim().toLowerCase());
}

/**
 * Normalize a bullet item for duplicate detection.
 * For wikilinks, compares by slug only (ignoring aliases) so that
 * `[[foo|Bar]]` and `[[foo|Baz]]` are treated as the same item.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeItem(value: string): string {
  const stripped = value.replace(/^- /, "").trim();
  // If the value contains wikilinks, key on their slugs only
  const slugs = extractWikilinkSlugs(stripped);
  if (slugs.length > 0) return slugs.join(" ");
  return normalizeLine(stripped);
}

/**
 * Build a human-readable title from the relative file path.
 *
 * @param {string} relativePath
 * @returns {string}
 */
function titleFromPath(relativePath: string): string {
  const fileName = path.basename(relativePath, path.extname(relativePath));
  return fileName
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Decide whether a section should render as bullets or paragraphs.
 *
 * @param {string} sectionName
 * @param {string} existingContent
 * @param {string[]} items
 * @returns {"bullet" | "paragraph"}
 */
function sectionMode(sectionName: string, existingContent: string, items: string[]): "bullet" | "paragraph" {
  if (BULLET_SECTIONS.has(sectionName.trim().toLowerCase())) {
    return "bullet";
  }

  const lines = existingContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 0 && lines.every((line) => line.startsWith("- "))) {
    return "bullet";
  }

  if (items.every((item) => item.startsWith("[[") || item.startsWith("- "))) {
    return "bullet";
  }

  return "paragraph";
}

/**
 * Split paragraph content on blank lines while trimming empty entries.
 *
 * @param {string} content
 * @returns {string[]}
 */
function splitParagraphs(content: string): string[] {
  return content
    .trim()
    .split(/\n\s*\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Merge bullet items idempotently into an existing section body.
 *
 * @param {string} existingContent
 * @param {string[]} items
 * @returns {string}
 */
function mergeBulletContent(existingContent: string, items: string[]): string {
  const existingLines = existingContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const allBullets = existingLines.length === 0 || existingLines.every((line) => line.startsWith("- "));

  // Build seen set from individual wikilink slugs found in existing lines so
  // that multi-link inline bullets (e.g. "- [[a]], [[b]]") don't bypass dedup.
  const seen = new Set<string>();
  for (const line of existingLines) {
    const slugs = extractWikilinkSlugs(line);
    if (slugs.length > 0) {
      for (const slug of slugs) seen.add(slug);
    } else {
      seen.add(normalizeItem(line));
    }
  }

  const merged = allBullets ? [...existingLines] : [...existingLines, ""];

  for (const item of items) {
    const bullet = item.startsWith("- ") ? item : `- ${item}`;
    const key = normalizeItem(bullet);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(bullet);
    }
  }

  return merged.join("\n").trim();
}

/**
 * Merge paragraph-like content idempotently into an existing section body.
 *
 * @param {string} existingContent
 * @param {string[]} items
 * @returns {string}
 */
function mergeParagraphContent(existingContent: string, items: string[]): string {
  const paragraphs = splitParagraphs(existingContent);
  const seen = new Set(paragraphs.map(normalizeLine));
  const merged = [...paragraphs];

  for (const item of items) {
    const paragraph = item.trim();
    const key = normalizeLine(paragraph);
    if (!paragraph || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(paragraph);
  }

  return merged.join("\n\n").trim();
}

/**
 * Parse a markdown note body into title, preamble, and second-level sections.
 *
 * @param {string} body
 * @returns {{ title: string, preamble: string, sections: Array<{ name: string, content: string }> }}
 */
export function parseSections(body: string): ParsedMarkdown {
  const lines = body.split("\n");
  let title = "";
  let index = 0;
  let titleFound = false;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("# ")) {
      title = trimmed.slice(2).trim();
      index += 1;
      titleFound = true;
      break;
    }

    index += 1;
  }

  if (!titleFound) {
    index = 0;
  }

  const preamble: string[] = [];
  const sections: MarkdownSection[] = [];
  let currentSection: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentSection) {
      return;
    }

    sections.push({
      name: currentSection,
      content: buffer.join("\n").trim()
    });
    buffer = [];
  };

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^##\s+(.+?)\s*$/.exec(line.trim());

    if (match) {
      flush();
      currentSection = match[1].trim();
      continue;
    }

    if (!currentSection) {
      preamble.push(line);
      continue;
    }

    buffer.push(line);
  }

  flush();

  return {
    title,
    preamble: preamble.join("\n").trim(),
    sections
  };
}

/**
 * Serialize a parsed note body back into markdown.
 *
 * Summary section placement rule: ## Summary must appear immediately after
 * the # Title, before any preamble content or other ## sections.  When a
 * Summary section is present it is rendered first, then the preamble, then
 * the remaining sections in their original order.
 *
 * @param {{ title: string, preamble: string, sections: Array<{ name: string, content: string }> }} param0
 * @returns {string}
 */
function stringifySections({ title, preamble, sections }: ParsedMarkdown): string {
  const chunks = [`# ${title}`];

  const summarySection = sections.find((s) => s.name.toLowerCase() === "summary");
  const otherSections = sections.filter((s) => s.name.toLowerCase() !== "summary");

  if (summarySection) {
    chunks.push("", `## ${summarySection.name}`, summarySection.content.trim());
  }

  if (preamble) {
    chunks.push("", preamble.trim());
  }

  for (const section of otherSections) {
    chunks.push("", `## ${section.name}`, section.content.trim());
  }

  return `${chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/**
 * Normalize section payload values into a clean list of strings.
 *
 * @param {string[] | string | unknown} items
 * @returns {string[]}
 */
function normalizeItems(items: string[] | string | unknown): string[] {
  if (!Array.isArray(items)) {
    return typeof items === "string" ? [items] : [];
  }

  return items.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

/**
 * Insert or merge a section without duplicating content.
 *
 * @param {Array<{ name: string, content: string }>} sectionEntries
 * @param {string} sectionName
 * @param {string[] | string} items
 */
function upsertSection(sectionEntries: MarkdownSection[], sectionName: string, items: string[] | string | unknown): void {
  const incomingItems = normalizeItems(items);
  if (incomingItems.length === 0) {
    return;
  }

  const existing = sectionEntries.find((entry) => entry.name.toLowerCase() === sectionName.toLowerCase());

  if (!existing) {
    const mode = sectionMode(sectionName, "", incomingItems);
    sectionEntries.push({
      name: sectionName,
      content: mode === "bullet" ? mergeBulletContent("", incomingItems) : mergeParagraphContent("", incomingItems)
    });
    return;
  }

  const mode = sectionMode(sectionName, existing.content, incomingItems);
  existing.content =
    mode === "bullet"
      ? mergeBulletContent(existing.content, incomingItems)
      : mergeParagraphContent(existing.content, incomingItems);
}

/**
 * Remove specific bullet items from a section (matched after normalization).
 * Non-bullet lines (paragraphs, blank lines) are always preserved.
 */
function removeSectionItems(sectionEntries: MarkdownSection[], sectionName: string, itemsToRemove: string[]): void {
  if (itemsToRemove.length === 0) return;
  const existing = sectionEntries.find((e) => e.name.toLowerCase() === sectionName.toLowerCase());
  if (!existing) return;

  // Build a set of individual slugs to remove (slug-level, not full-string).
  const slugsToRemove = new Set(itemsToRemove.flatMap((item) => extractWikilinkSlugs(item)));
  // Also keep the full normalizeItem keys for non-wikilink items.
  const normalizedToRemove = new Set(itemsToRemove.map(normalizeItem));

  const lines = existing.content.split("\n");
  existing.content = lines
    .filter((line) => {
      if (!line.trimStart().startsWith("- ")) return true;
      const trimmed = line.trim();
      // Full-line match (handles non-wikilink bullets and single-link bullets).
      if (normalizedToRemove.has(normalizeItem(trimmed))) return false;
      // Per-slug match: remove any bullet whose slugs are ALL in the remove set
      // (handles multi-link inline bullets like "- [[a]], [[b]]").
      const slugs = extractWikilinkSlugs(trimmed);
      if (slugs.length > 0 && slugs.every((s) => slugsToRemove.has(s))) return false;
      return true;
    })
    .join("\n");
}

/**
 * Render the next markdown state for a note while preserving existing content.
 *
 * @param {string} relativePath
 * @param {string | null} existingText
 * @param {Record<string, any>} [payload={}]
 * @param {{ updatedDate?: string, updatedBy?: string }} [runtime={}]
 * @returns {string}
 */
export function renderMarkdown(
  relativePath: string,
  existingText: string | null,
  payload: MarkdownPayload = {},
  runtime: RenderRuntime = {}
): string {
  const base = existingText ? splitFrontmatter(existingText) : { frontmatter: {}, body: "" };
  const parsedBody = parseSections(base.body || "");
  const mergedFrontmatter = mergeFrontmatter(base.frontmatter || {}, payload.frontmatter || {}) as Record<string, unknown>;
  const sections = parsedBody.sections.map((section) => ({ ...section }));
  const title = payload.title || parsedBody.title || titleFromPath(relativePath);

  if (runtime.updatedDate) {
    mergedFrontmatter.updated = runtime.updatedDate;
  }

  if (runtime.updatedBy) {
    mergedFrontmatter.updated_by = runtime.updatedBy;
  }

  if (payload.change_reason) {
    mergedFrontmatter.change_reason = payload.change_reason;
  }

  for (const [sectionName, items] of Object.entries(payload.sections_remove || {})) {
    removeSectionItems(sections, sectionName, items);
  }

  for (const [sectionName, items] of Object.entries(payload.sections || {})) {
    upsertSection(sections, sectionName, items);
  }

  if (Array.isArray(payload.related_links) && payload.related_links.length > 0) {
    upsertSection(sections, "Related", payload.related_links);
  }

  const topicRelatedMax = SYSTEM_CONFIG.wiki.topicRelatedLinksMax;
  if (relativePath.startsWith("wiki/topics/") && topicRelatedMax > 0) {
    const relatedSection = sections.find((s) => s.name.toLowerCase() === "related");
    if (relatedSection) {
      const bullets = relatedSection.content.split("\n").filter((l) => l.trimStart().startsWith("- "));
      if (bullets.length > topicRelatedMax) {
        relatedSection.content = bullets.slice(0, topicRelatedMax).join("\n");
      }
    }
  }

  const markdownBody = stringifySections({
    title,
    preamble: parsedBody.preamble,
    sections
  });

  return `${stringifyFrontmatter(mergedFrontmatter)}${markdownBody}`.trimEnd() + "\n";
}
