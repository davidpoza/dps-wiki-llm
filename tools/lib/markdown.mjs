import path from "node:path";

import { mergeFrontmatter, splitFrontmatter, stringifyFrontmatter } from "./frontmatter.mjs";

const BULLET_SECTIONS = new Set([
  "facts",
  "related",
  "sources",
  "open questions",
  "extracted claims",
  "linked notes",
  "key concepts",
  "key entities",
  "relationships",
  "gaps",
  "evidence"
]);

function normalizeLine(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeItem(value) {
  return normalizeLine(value.replace(/^- /, ""));
}

function titleFromPath(relativePath) {
  const fileName = path.basename(relativePath, path.extname(relativePath));
  return fileName
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function sectionMode(sectionName, existingContent, items) {
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

function splitParagraphs(content) {
  return content
    .trim()
    .split(/\n\s*\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeBulletContent(existingContent, items) {
  const existingLines = existingContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const allBullets = existingLines.length === 0 || existingLines.every((line) => line.startsWith("- "));
  const seen = new Set(existingLines.map(normalizeItem));
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

function mergeParagraphContent(existingContent, items) {
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

function parseSections(body) {
  const lines = body.split("\n");
  let title = "";
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("# ")) {
      title = trimmed.slice(2).trim();
      index += 1;
      break;
    }

    index += 1;
  }

  const preamble = [];
  const sections = [];
  let currentSection = null;
  let buffer = [];

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

function stringifySections({ title, preamble, sections }) {
  const chunks = [`# ${title}`];

  if (preamble) {
    chunks.push("", preamble.trim());
  }

  for (const section of sections) {
    chunks.push("", `## ${section.name}`, section.content.trim());
  }

  return `${chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return typeof items === "string" ? [items] : [];
  }

  return items.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function upsertSection(sectionEntries, sectionName, items) {
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

export function renderMarkdown(relativePath, existingText, payload = {}, runtime = {}) {
  const base = existingText ? splitFrontmatter(existingText) : { frontmatter: {}, body: "" };
  const parsedBody = parseSections(base.body || "");
  const mergedFrontmatter = mergeFrontmatter(base.frontmatter || {}, payload.frontmatter || {});
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

  for (const [sectionName, items] of Object.entries(payload.sections || {})) {
    upsertSection(sections, sectionName, items);
  }

  if (Array.isArray(payload.related_links) && payload.related_links.length > 0) {
    upsertSection(sections, "Related", payload.related_links);
  }

  const markdownBody = stringifySections({
    title,
    preamble: parsedBody.preamble,
    sections
  });

  return `${stringifyFrontmatter(mergedFrontmatter)}${markdownBody}`.trimEnd() + "\n";
}
