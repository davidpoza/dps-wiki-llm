import crypto from "node:crypto";

/**
 * Small text helpers shared by CLI scripts that need stable identifiers and artifact names.
 */

export function stableHash(value: string, length = 10, algorithm = "sha1"): string {
  return crypto.createHash(algorithm).update(value).digest("hex").slice(0, length);
}

export function slugify(value: string, maxLength: number, fallback = "item"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");

  return slug || fallback;
}

export function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function firstMeaningfulParagraph(value: string): string {
  const cleaned = value
    .replace(/^# .+$/gm, "")
    .split(/\n\s*\n/g)
    .map((entry) => entry.trim())
    .find(Boolean);

  return cleaned || value.trim();
}
