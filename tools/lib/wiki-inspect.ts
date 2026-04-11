import fs from "node:fs/promises";
import path from "node:path";

import { splitFrontmatter } from "./frontmatter.js";
import { parseSections } from "./markdown.js";
import { relativeVaultPath, resolveWithinRoot, toPosixPath } from "./fs-utils.js";
import { SYSTEM_CONFIG } from "../config.js";
import type { WikiDoc, WikiGraph, WikiLink } from "./contracts.js";

/**
 * Wiki loading and graph-analysis helpers shared by indexing and maintenance.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Recursively collect markdown files below a directory in sorted order.
 *
 * @param {string} dirPath
 * @returns {Promise<string[]>}
 */
async function walkMarkdownFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && absolutePath.endsWith(".md")) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

/**
 * Infer a document type from explicit frontmatter or its folder placement.
 *
 * @param {string} relativePath
 * @param {Record<string, any>} frontmatter
 * @returns {string}
 */
export function inferDocType(relativePath: string, frontmatter: Record<string, unknown>): string {
  if (typeof frontmatter.type === "string" && frontmatter.type.trim()) {
    return frontmatter.type.trim();
  }

  const parts = toPosixPath(relativePath).split("/");
  for (const [folder, docType] of Object.entries(SYSTEM_CONFIG.wiki.docTypeFolders)) {
    if (parts.includes(folder)) {
      return docType;
    }
  }

  return "unknown";
}

/**
 * Extract the preferred note title from frontmatter, markdown, or filename.
 *
 * @param {string} relativePath
 * @param {Record<string, any>} frontmatter
 * @param {string} body
 * @returns {string}
 */
export function extractTitle(relativePath: string, frontmatter: Record<string, unknown>, body: string): string {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  const match = body.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }

  return path.basename(relativePath, path.extname(relativePath));
}

/**
 * Extract the best available updated timestamp for indexing and maintenance.
 *
 * @param {Record<string, any>} frontmatter
 * @param {{ mtime: Date }} stats
 * @returns {string}
 */
export function extractUpdatedAt(frontmatter: Record<string, unknown>, stats: { mtime: Date }): string {
  if (typeof frontmatter.updated === "string" && frontmatter.updated.trim()) {
    return frontmatter.updated.trim();
  }

  if (typeof frontmatter.updated_at === "string" && frontmatter.updated_at.trim()) {
    return frontmatter.updated_at.trim();
  }

  return stats.mtime.toISOString();
}

/**
 * Remove the markdown extension from a vault-relative path.
 *
 * @param {string} relativePath
 * @returns {string}
 */
function fileStem(relativePath: string): string {
  return toPosixPath(relativePath).replace(new RegExp(`${escapeRegExp(SYSTEM_CONFIG.wiki.markdownExtension)}$`, "i"), "");
}

/**
 * Normalize a wiki-link target so aliases can be matched consistently.
 *
 * @param {string} target
 * @returns {string}
 */
function normalizeLinkTarget(target: string): string {
  return toPosixPath(target.trim())
    .replace(/^\//, "")
    .replace(new RegExp(`^${SYSTEM_CONFIG.wiki.wikiPathPrefix}`), "")
    .replace(new RegExp(`${escapeRegExp(SYSTEM_CONFIG.wiki.markdownExtension)}$`, "i"), "")
    .split("|")[0]
    .split("#")[0]
    .trim();
}

/**
 * Build the alias set that can resolve wiki links to this document.
 *
 * @param {string} relativePath
 * @param {string} title
 * @returns {Set<string>}
 */
function buildAliases(relativePath: string, title: string): Set<string> {
  const stem = fileStem(relativePath);
  const relativeToWiki = stem.replace(new RegExp(`^${SYSTEM_CONFIG.wiki.wikiPathPrefix}`), "");
  const base = path.posix.basename(stem);

  return new Set([stem, relativeToWiki, base, title].filter(Boolean).map((entry) => normalizeLinkTarget(entry)));
}

/**
 * Extract raw and normalized wiki-link targets from markdown content.
 *
 * @param {string} body
 * @returns {Array<{ raw: string, normalized: string }>}
 */
export function extractWikiLinks(body: string): WikiLink[] {
  const results: WikiLink[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;

  for (const match of body.matchAll(regex)) {
    const rawTarget = match[1].trim();
    const normalized = normalizeLinkTarget(rawTarget);
    if (!normalized) {
      continue;
    }

    results.push({
      raw: rawTarget,
      normalized
    });
  }

  return results;
}

/**
 * Load all wiki markdown files and derive the metadata used by the rest of the toolchain.
 *
 * @param {string} vaultRoot
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function loadWikiDocs(vaultRoot: string): Promise<WikiDoc[]> {
  const wikiRoot = resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.wikiDir);
  const files = await walkMarkdownFiles(wikiRoot).catch((error) => {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  });

  const docs: WikiDoc[] = [];

  for (const absolutePath of files) {
    const relativePath = relativeVaultPath(vaultRoot, absolutePath);
    const stats = await fs.stat(absolutePath);
    const raw = await fs.readFile(absolutePath, "utf8");
    const { frontmatter, body } = splitFrontmatter(raw);
    const title = extractTitle(relativePath, frontmatter, body);
    const docType = inferDocType(relativePath, frontmatter);
    const updatedAt = extractUpdatedAt(frontmatter, stats);
    const parsed = parseSections(body);
    const wikiLinks = extractWikiLinks(body);
    const sectionMap = new Map(parsed.sections.map((section) => [section.name.toLowerCase(), section]));

    docs.push({
      absolutePath,
      relativePath,
      raw,
      body,
      frontmatter,
      title,
      docType,
      updatedAt,
      lineCount: raw.split("\n").length,
      sectionCount: parsed.sections.length,
      sections: parsed.sections,
      sectionMap,
      wikiLinks,
      aliases: buildAliases(relativePath, title)
    });
  }

  return docs;
}

/**
 * Build a lightweight link graph over loaded wiki documents.
 *
 * @param {Array<{
 *   relativePath: string,
 *   aliases: Set<string>,
 *   wikiLinks: Array<{ raw: string, normalized: string }>
 * }>} docs
 * @returns {{
 *   aliasMap: Map<string, string[]>,
 *   pathMap: Map<string, any>,
 *   inboundCounts: Map<string, number>,
 *   resolvedLinks: Map<string, string[]>,
 *   brokenLinks: Map<string, Array<{ raw: string, normalized: string }>>,
 *   ambiguousTargets: Map<string, Array<{ raw: string, normalized: string, matches: string[] }>>
 * }}
 */
export function analyzeWikiGraph(docs: WikiDoc[]): WikiGraph {
  const aliasMap = new Map<string, string[]>();
  const pathMap = new Map<string, WikiDoc>();

  for (const doc of docs) {
    pathMap.set(doc.relativePath, doc);

    for (const alias of doc.aliases) {
      const bucket = aliasMap.get(alias) || [];
      bucket.push(doc.relativePath);
      aliasMap.set(alias, bucket);
    }
  }

  const inboundCounts = new Map<string, number>();
  const resolvedLinks = new Map<string, string[]>();
  const brokenLinks = new Map<string, WikiLink[]>();
  const ambiguousTargets = new Map<string, Array<WikiLink & { matches: string[] }>>();

  for (const doc of docs) {
    const resolved: string[] = [];
    const broken: WikiLink[] = [];
    const ambiguous: Array<WikiLink & { matches: string[] }> = [];

    for (const link of doc.wikiLinks) {
      const matches = aliasMap.get(link.normalized) || [];

      if (matches.length === 1) {
        const target = matches[0];
        resolved.push(target);
        inboundCounts.set(target, (inboundCounts.get(target) || 0) + 1);
        continue;
      }

      if (matches.length > 1) {
        ambiguous.push({
          ...link,
          matches
        });
        continue;
      }

      broken.push(link);
    }

    resolvedLinks.set(doc.relativePath, resolved);
    brokenLinks.set(doc.relativePath, broken);
    ambiguousTargets.set(doc.relativePath, ambiguous);
  }

  return {
    aliasMap,
    pathMap,
    inboundCounts,
    resolvedLinks,
    brokenLinks,
    ambiguousTargets
  };
}
