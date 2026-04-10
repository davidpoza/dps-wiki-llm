import fs from "node:fs/promises";
import path from "node:path";

import { splitFrontmatter } from "./frontmatter.mjs";
import { parseSections } from "./markdown.mjs";
import { relativeVaultPath, resolveWithinRoot, toPosixPath } from "./fs-utils.mjs";

async function walkMarkdownFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

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

export function inferDocType(relativePath, frontmatter) {
  if (typeof frontmatter.type === "string" && frontmatter.type.trim()) {
    return frontmatter.type.trim();
  }

  const parts = toPosixPath(relativePath).split("/");
  if (parts.includes("concepts")) {
    return "concept";
  }

  if (parts.includes("entities")) {
    return "entity";
  }

  if (parts.includes("topics")) {
    return "topic";
  }

  if (parts.includes("sources")) {
    return "source";
  }

  if (parts.includes("analyses")) {
    return "analysis";
  }

  if (parts.includes("indexes")) {
    return "index";
  }

  return "unknown";
}

export function extractTitle(relativePath, frontmatter, body) {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  const match = body.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }

  return path.basename(relativePath, path.extname(relativePath));
}

export function extractUpdatedAt(frontmatter, stats) {
  if (typeof frontmatter.updated === "string" && frontmatter.updated.trim()) {
    return frontmatter.updated.trim();
  }

  if (typeof frontmatter.updated_at === "string" && frontmatter.updated_at.trim()) {
    return frontmatter.updated_at.trim();
  }

  return stats.mtime.toISOString();
}

function fileStem(relativePath) {
  return toPosixPath(relativePath).replace(/\.md$/i, "");
}

function normalizeLinkTarget(target) {
  return toPosixPath(target.trim())
    .replace(/^\//, "")
    .replace(/^wiki\//, "")
    .replace(/\.md$/i, "")
    .split("|")[0]
    .split("#")[0]
    .trim();
}

function buildAliases(relativePath, title) {
  const stem = fileStem(relativePath);
  const relativeToWiki = stem.replace(/^wiki\//, "");
  const base = path.posix.basename(stem);

  return new Set([stem, relativeToWiki, base, title].filter(Boolean).map((entry) => normalizeLinkTarget(entry)));
}

export function extractWikiLinks(body) {
  const results = [];
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

export async function loadWikiDocs(vaultRoot) {
  const wikiRoot = resolveWithinRoot(vaultRoot, "wiki");
  const files = await walkMarkdownFiles(wikiRoot).catch((error) => {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  });

  const docs = [];

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

export function analyzeWikiGraph(docs) {
  const aliasMap = new Map();
  const pathMap = new Map();

  for (const doc of docs) {
    pathMap.set(doc.relativePath, doc);

    for (const alias of doc.aliases) {
      const bucket = aliasMap.get(alias) || [];
      bucket.push(doc.relativePath);
      aliasMap.set(alias, bucket);
    }
  }

  const inboundCounts = new Map();
  const resolvedLinks = new Map();
  const brokenLinks = new Map();
  const ambiguousTargets = new Map();

  for (const doc of docs) {
    const resolved = [];
    const broken = [];
    const ambiguous = [];

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
