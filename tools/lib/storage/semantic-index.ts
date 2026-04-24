/**
 * @module semantic-index
 *
 * Core data layer for the semantic (vector) index.
 *
 * Role in the pipeline:
 *   1. `embed-index` calls the write helpers here to persist embedding units
 *      and update the manifest after computing embeddings.
 *   2. `semantic-search` calls the read helpers to load all units into memory,
 *      then scores them with `cosineSimilarity`.
 *   3. `hybrid-search` imports `manifestPath` to test whether the index exists
 *      before deciding whether to run the semantic leg.
 *
 * Directory layout produced under `<vaultRoot>/<semanticDir>/`:
 *   manifest.json          — index registry (see SemanticManifest)
 *   notes/<id>.json        — one EmbeddingUnit per wiki note
 *
 * Reads:  existing manifest.json and note JSON files.
 * Writes: manifest.json and notes/*.json via `saveManifest` / `saveEmbeddingUnit`.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ensureDirectory, loadJsonFile, writeJsonFile } from "./fs-utils.js";
import { resolvedEmbedModel, SYSTEM_CONFIG } from "../../config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The persisted record for a single embedded wiki note.
 * One file per note, stored under `<semanticDir>/notes/`.
 */
export interface EmbeddingUnit {
  /**
   * Stable identifier for this unit, derived from its vault-relative path.
   * Format: `<relPath>#note`, e.g. `"wiki/Foo.md#note"`.
   * The `#note` suffix reserves space for future sub-document granularity
   * (e.g. section-level chunks).
   */
  id: string;

  /** Granularity discriminant. Currently always "note" (whole-file). */
  kind: "note";

  /** Vault-relative file path, e.g. `"wiki/Foo.md"`. */
  path: string;

  /**
   * Human-readable title: taken from the YAML `title:` field if present,
   * otherwise the bare filename without extension.
   */
  title: string;

  /**
   * Document type classification from the YAML `type:` field, or `"unknown"`.
   * Passed through to search results for downstream filtering.
   */
  doc_type: string;

  /**
   * First 16 hex characters of the SHA-256 hash of the normalised text.
   * Used by `embed-index` to skip re-embedding unchanged documents.
   */
  hash: string;

  /**
   * The dense embedding vector produced by the configured model.
   * Length equals `SemanticManifest.dimension`.
   */
  embedding: number[];

  /**
   * First 200 characters of the normalised text, stored for debug inspection
   * without needing to reload the original markdown file.
   */
  text_preview: string;
}

/**
 * A single entry in the manifest's `items` map.
 * Stores just enough to locate the unit on disk and detect staleness.
 */
export interface ManifestItem {
  /**
   * Path to the EmbeddingUnit JSON file, relative to `<semanticDir>/`.
   * Forward slashes only (normalised on Windows too).
   * Example: `"notes/wiki__Foo.md_note.json"`.
   */
  file: string;

  /**
   * Hash copied from `EmbeddingUnit.hash`.  Compared against the hash of
   * the current file content to determine whether re-embedding is needed.
   */
  hash: string;
}

/**
 * Top-level manifest file: `<semanticDir>/manifest.json`.
 *
 * Schema versioning:
 *   `version: 1` is the only current schema.  If the schema changes
 *   incompatibly, bump the version so `embed-index` can detect stale indexes
 *   and trigger a forced rebuild.
 *
 * The manifest is intentionally lightweight — it holds only metadata, not
 * vectors — so it can be read quickly to answer "does this note need
 * re-embedding?" without loading any embedding files.
 */
export interface SemanticManifest {
  /** Schema version. Currently always 1. */
  version: 1;

  /**
   * Model identifier recorded at build time (e.g. `"Xenova/bge-m3"`).
   * If this differs from the currently configured model, all entries are stale
   * and a `--rebuild` run is required.
   */
  model: string;

  /**
   * Vector dimensionality produced by `model`.
   * Informational; consumers can pre-allocate buffers with this value.
   */
  dimension: number;

  /** Granularity of the index. Currently always "note". */
  mode: "note";

  /** ISO-8601 timestamp of the last completed index build/update run. */
  last_rebuild_at: string;

  /**
   * Map from unit ID (e.g. `"wiki/Foo.md#note"`) to its `ManifestItem`.
   * Acts as the index registry: present = indexed, absent = not indexed.
   */
  items: Record<string, ManifestItem>;
}

/**
 * Sentinel value used when no manifest file exists on disk yet.
 * `last_rebuild_at` is set to epoch so every document appears stale on
 * first run.  `items` starts empty.
 */
const EMPTY_MANIFEST: SemanticManifest = {
  version: 1,
  model: resolvedEmbedModel(),
  dimension: 1024,
  mode: "note",
  last_rebuild_at: new Date(0).toISOString(),
  items: {}
};

// ── Paths ─────────────────────────────────────────────────────────────────────

/**
 * Absolute path to the semantic index directory for a given vault.
 *
 * @param vaultRoot - Absolute path to the vault root directory.
 * @returns Absolute path to `<vaultRoot>/<semanticDir>`.
 */
export function semanticDirPath(vaultRoot: string): string {
  return path.join(vaultRoot, SYSTEM_CONFIG.paths.semanticDir);
}

/**
 * Absolute path to the manifest file for a given vault.
 * Used by `hybrid-search` to test index existence before spawning sub-tools.
 *
 * @param vaultRoot - Absolute path to the vault root directory.
 * @returns Absolute path to `<vaultRoot>/<semanticDir>/manifest.json`.
 */
export function manifestPath(vaultRoot: string): string {
  return path.join(semanticDirPath(vaultRoot), "manifest.json");
}

/**
 * Derive the absolute path where an embedding unit file will be stored.
 *
 * Path separators and `#` characters in the note ID are replaced with
 * safe filename characters (`/` and `\` → `__`, `#` → `_`) so that the
 * entire note ID becomes a single flat filename component with no directory
 * traversal risk.
 *
 * @param vaultRoot - Absolute path to the vault root directory.
 * @param noteId    - Unit ID, e.g. `"wiki/Foo.md#note"`.
 * @returns Absolute path to the JSON file, e.g.
 *          `<semanticDir>/notes/wiki__Foo.md_note.json`.
 */
function embeddingFilePath(vaultRoot: string, noteId: string): string {
  // Flatten path separators to double-underscore for safe filenames.
  const safeName = noteId.replace(/[/\\]/g, "__").replace(/#/g, "_") + ".json";
  return path.join(semanticDirPath(vaultRoot), "notes", safeName);
}

// ── Manifest I/O ──────────────────────────────────────────────────────────────

/**
 * Load the manifest from disk, returning `EMPTY_MANIFEST` if the file does
 * not yet exist.  Never throws for a missing file.
 *
 * @param vaultRoot - Absolute path to the vault root directory.
 * @returns The parsed `SemanticManifest`, or the empty sentinel value.
 */
export async function loadManifest(vaultRoot: string): Promise<SemanticManifest> {
  return loadJsonFile<SemanticManifest>(manifestPath(vaultRoot), { ...EMPTY_MANIFEST, items: {} });
}

/**
 * Persist the manifest to disk, creating the semantic directory if needed.
 *
 * @param vaultRoot - Absolute path to the vault root directory.
 * @param manifest  - The manifest object to write.
 */
export async function saveManifest(vaultRoot: string, manifest: SemanticManifest): Promise<void> {
  await ensureDirectory(semanticDirPath(vaultRoot));
  await writeJsonFile(manifestPath(vaultRoot), manifest);
}

// ── Embedding unit I/O ────────────────────────────────────────────────────────

/**
 * Write an `EmbeddingUnit` to its canonical path under `<semanticDir>/notes/`.
 * Creates parent directories as needed.
 *
 * @param vaultRoot - Absolute path to the vault root directory.
 * @param unit      - The fully-populated embedding unit to persist.
 * @returns The path of the written file, relative to `<semanticDir>/`,
 *          with forward slashes (for cross-platform manifest entries).
 *          Example: `"notes/wiki__Foo.md_note.json"`.
 */
export async function saveEmbeddingUnit(vaultRoot: string, unit: EmbeddingUnit): Promise<string> {
  const filePath = embeddingFilePath(vaultRoot, unit.id);
  await ensureDirectory(path.dirname(filePath));
  await writeJsonFile(filePath, unit);
  return path.relative(semanticDirPath(vaultRoot), filePath).replace(/\\/g, "/");
}

/**
 * Load a single `EmbeddingUnit` by its manifest-relative file path.
 * Returns `null` if the file is missing or unreadable (e.g. after a manual
 * deletion) rather than throwing, so callers can skip stale entries.
 *
 * @param vaultRoot    - Absolute path to the vault root directory.
 * @param relativeFile - Path relative to `<semanticDir>/`, as stored in
 *                       `ManifestItem.file`.
 * @returns The parsed `EmbeddingUnit`, or `null` on any read/parse error.
 */
export async function loadEmbeddingUnit(vaultRoot: string, relativeFile: string): Promise<EmbeddingUnit | null> {
  const filePath = path.join(semanticDirPath(vaultRoot), relativeFile);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as EmbeddingUnit;
  } catch {
    return null;
  }
}

/**
 * Load all `EmbeddingUnit` objects referenced by a manifest in parallel.
 * Units whose files cannot be read are silently omitted (see `loadEmbeddingUnit`).
 *
 * This loads every embedding vector into memory — appropriate for
 * brute-force nearest-neighbour search at the dataset sizes this tool targets,
 * where a proper ANN index would be over-engineering.
 *
 * @param vaultRoot - Absolute path to the vault root directory.
 * @param manifest  - The manifest whose `items` map will be iterated.
 * @returns Array of successfully loaded `EmbeddingUnit` objects (order is
 *          non-deterministic due to parallel I/O).
 */
export async function loadAllEmbeddingUnits(
  vaultRoot: string,
  manifest: SemanticManifest
): Promise<EmbeddingUnit[]> {
  const units: EmbeddingUnit[] = [];

  await Promise.all(
    Object.values(manifest.items).map(async (item) => {
      const unit = await loadEmbeddingUnit(vaultRoot, item.file);

      if (unit) units.push(unit);
    })
  );

  return units;
}

// ── Text normalization ────────────────────────────────────────────────────────

/**
 * Convert raw markdown into a clean plain-text string suitable for embedding.
 *
 * Normalisation pipeline (applied in order):
 *   1. Strip YAML frontmatter (`--- ... ---`) — metadata fields like `tags:`
 *      and `date:` add noise without semantic signal.
 *   2. Strip navigational/reference sections (`Related`, `Sources`, `References`) —
 *      link titles and external citations bias the embedding toward linked notes
 *      or cited topics rather than the note's own content.
 *   3. Expand wikilinks — `[[Page|Alias]]` → `"Alias"`, `[[Page]]` → `"Page"`.
 *      Keeps the human-readable anchor text so the meaning is preserved.
 *   4. Remove markdown image/link syntax — `[text](url)` → `"text"`,
 *      `![alt](url)` → `"alt"`.  URLs carry no semantic content.
 *   5. Remove bare URLs (`https?://...`) that may appear outside of markdown
 *      link syntax.
 *   6. Strip heading markers (`##`, `###`, etc.) — the words remain; only the
 *      structural punctuation is removed.
 *   7. Collapse all runs of whitespace (spaces, tabs, newlines) to a single
 *      space and trim.  This produces a single-line string, which is what most
 *      transformer tokenisers expect when `normalize: true` is set.
 *
 * @param raw - Raw markdown file content.
 * @returns Normalised plain-text string, or an empty string if the file
 *          contained only frontmatter/markup.
 *
 * @example
 * normalizeTextForEmbedding("---\ntitle: Foo\n---\n# Hello [[World]]");
 * // => "Hello World"
 */
export function normalizeTextForEmbedding(raw: string): string {
  let text = raw;

  // Remove YAML frontmatter (--- ... ---)
  text = text.replace(/^---[\s\S]*?---\n?/, "");

  // Remove navigational/reference sections that carry no knowledge content.
  // These sections introduce link titles that bias the embedding toward linked
  // notes — a wrong Related link would propagate its topics into this note's
  // vector, causing further false positives in semantic search.
  text = text.replace(/^##+ *(Related|Sources?|Fuentes?|References?)\s*\n([\s\S]*?)(?=^##+ |\s*$)/gim, "");

  // Convert [[wikilink|alias]] and [[wikilink]] to plain text
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target);

  // Remove markdown image/link URLs, keep display text
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Remove bare URLs
  text = text.replace(/https?:\/\/\S+/g, "");

  // Remove markdown headers markers
  text = text.replace(/^#{1,6}\s+/gm, "");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Extract the plain-text content of a `## Summary` section from raw markdown.
 *
 * Returns `null` if no Summary section exists or if the section is empty.
 * The extracted text is normalised (markup stripped, whitespace collapsed)
 * so it can be used directly as embedding input.
 *
 * @param raw - Raw markdown file content.
 * @returns Normalised summary text, or `null` if absent/empty.
 */
export function extractSummarySection(raw: string): string | null {
  // Match ## Summary (case-insensitive) up to the next ## heading or end of string.
  const match = raw.match(/^##+ *Summary\s*\n([\s\S]*?)(?=^##+ |\s*$)/im);
  if (!match) return null;

  const content = normalizeTextForEmbedding(match[1]);
  return content.length > 0 ? content : null;
}

// ── Hash ─────────────────────────────────────────────────────────────────────

/**
 * Compute a short content fingerprint for change detection.
 *
 * Returns the first 16 hex characters of SHA-256(text), giving 64 bits of
 * collision resistance — sufficient for change-detection across a personal
 * wiki (birthday-attack probability is negligible at <100 k documents).
 *
 * The hash is computed over the *normalised* text (not the raw markdown) so
 * that whitespace-only or formatting-only edits that don't affect embedding
 * content are correctly treated as no-ops.
 *
 * @param text - Normalised plain-text string (output of `normalizeTextForEmbedding`).
 * @returns 16-character lowercase hex string.
 */
export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

/**
 * Compute the cosine similarity between two embedding vectors.
 *
 * Why cosine similarity?
 *   The embeddings produced by bi-encoder retrieval models (BGE, E5, etc.)
 *   are trained with a cosine similarity objective.  Cosine similarity is
 *   rotation-invariant and magnitude-invariant, so it correctly captures
 *   the semantic angle between two vectors regardless of their L2 norm.
 *   When `normalize: true` is passed to the transformers pipeline the output
 *   vectors are already L2-normalised, making cosine similarity equivalent to
 *   the dot product — but this implementation handles both normalised and
 *   unnormalised inputs correctly.
 *
 * Edge cases:
 *   - Mismatched or zero-length arrays return 0 rather than throwing.
 *   - A zero-norm vector (all-zeros) returns 0 to avoid division by zero.
 *
 * @param a - First embedding vector.
 * @param b - Second embedding vector, must have the same length as `a`.
 * @returns Cosine similarity in [-1, 1]; higher is more similar.
 *          Returns 0 for zero-length or mismatched arrays.
 *
 * @example
 * cosineSimilarity([1, 0], [1, 0]); // => 1   (identical)
 * cosineSimilarity([1, 0], [0, 1]); // => 0   (orthogonal)
 * cosineSimilarity([1, 0], [-1, 0]); // => -1  (opposite)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
