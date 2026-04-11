/**
 * Minimal frontmatter parsing and serialization for deterministic note updates.
 */

type FrontmatterScalar = string | number | boolean | null;
type FrontmatterValue = FrontmatterScalar | FrontmatterObject | FrontmatterArray;
interface FrontmatterObject {
  [key: string]: FrontmatterValue;
}
interface FrontmatterArray extends Array<FrontmatterValue> {}

interface ParseResult<T = FrontmatterValue> {
  value: T;
  nextIndex: number;
}

/**
 * Count leading spaces so nested frontmatter blocks can be parsed by indentation.
 *
 * @param {string} line
 * @returns {number}
 */
function countIndent(line: string): number {
  let indent = 0;

  while (indent < line.length && line[indent] === " ") {
    indent += 1;
  }

  return indent;
}

/**
 * Ignore blank lines and comment lines inside frontmatter blocks.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isMeaningful(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== "" && !trimmed.startsWith("#");
}

/**
 * Find the next line that contains actual frontmatter content.
 *
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {number}
 */
function nextMeaningfulIndex(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (isMeaningful(lines[index])) {
      return index;
    }
  }

  return -1;
}

/**
 * Parse a scalar frontmatter value from the limited YAML subset this project uses.
 *
 * @param {string} rawValue
 * @returns {any}
 */
function parseScalar(rawValue: string): FrontmatterValue {
  const value = rawValue.trim();

  if (value === "") {
    return "";
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const quote = value[0];
    if (quote === '"') {
      return JSON.parse(value);
    }

    return value.slice(1, -1).replaceAll("\\'", "'");
  }

  return value;
}

/**
 * Parse either a mapping or a sequence at the current indentation level.
 *
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {number} indent
 * @returns {{ value: any, nextIndex: number }}
 */
function parseBlock(lines: string[], startIndex: number, indent: number): ParseResult {
  const meaningfulIndex = nextMeaningfulIndex(lines, startIndex);

  if (meaningfulIndex === -1) {
    return { value: {}, nextIndex: lines.length };
  }

  const line = lines[meaningfulIndex];
  const lineIndent = countIndent(line);

  if (lineIndent < indent) {
    return { value: {}, nextIndex: meaningfulIndex };
  }

  if (line.trim().startsWith("- ")) {
    return parseSequence(lines, meaningfulIndex, lineIndent);
  }

  return parseMapping(lines, meaningfulIndex, lineIndent);
}

/**
 * Parse a frontmatter mapping node.
 *
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {number} indent
 * @returns {{ value: Record<string, any>, nextIndex: number }}
 */
function parseMapping(lines: string[], startIndex: number, indent: number): ParseResult<FrontmatterObject> {
  const output: FrontmatterObject = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (!isMeaningful(line)) {
      index += 1;
      continue;
    }

    const lineIndent = countIndent(line);

    if (lineIndent < indent) {
      break;
    }

    if (lineIndent > indent) {
      throw new Error(`Invalid frontmatter indentation near: ${line.trim()}`);
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      break;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Invalid frontmatter mapping line: ${trimmed}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const remainder = trimmed.slice(separatorIndex + 1).trim();

    if (remainder !== "") {
      output[key] = parseScalar(remainder);
      index += 1;
      continue;
    }

    const childIndex = nextMeaningfulIndex(lines, index + 1);
    if (childIndex === -1 || countIndent(lines[childIndex]) <= indent) {
      output[key] = "";
      index += 1;
      continue;
    }

    const child = parseBlock(lines, childIndex, countIndent(lines[childIndex]));
    output[key] = child.value;
    index = child.nextIndex;
  }

  return { value: output, nextIndex: index };
}

/**
 * Parse a frontmatter sequence node.
 *
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {number} indent
 * @returns {{ value: any[], nextIndex: number }}
 */
function parseSequence(lines: string[], startIndex: number, indent: number): ParseResult<FrontmatterValue[]> {
  const output: FrontmatterValue[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (!isMeaningful(line)) {
      index += 1;
      continue;
    }

    const lineIndent = countIndent(line);

    if (lineIndent < indent) {
      break;
    }

    if (lineIndent > indent) {
      throw new Error(`Invalid frontmatter indentation near: ${line.trim()}`);
    }

    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      break;
    }

    const remainder = trimmed.slice(2).trim();

    if (remainder !== "") {
      output.push(parseScalar(remainder));
      index += 1;
      continue;
    }

    const childIndex = nextMeaningfulIndex(lines, index + 1);
    if (childIndex === -1 || countIndent(lines[childIndex]) <= indent) {
      output.push("");
      index += 1;
      continue;
    }

    const child = parseBlock(lines, childIndex, countIndent(lines[childIndex]));
    output.push(child.value);
    index = child.nextIndex;
  }

  return { value: output, nextIndex: index };
}

/**
 * Serialize a scalar back into frontmatter-safe text.
 *
 * @param {any} value
 * @returns {string}
 */
function formatScalar(value: FrontmatterValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  throw new Error(`Unsupported frontmatter scalar: ${String(value)}`);
}

/**
 * Check whether a value is a non-array plain object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value: unknown): value is FrontmatterObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Serialize nested frontmatter nodes with stable indentation.
 *
 * @param {any} value
 * @param {number} [indent=0]
 * @returns {string}
 */
function stringifyNode(value: FrontmatterValue, indent = 0): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const prefix = `${" ".repeat(indent)}-`;
        if (isPlainObject(item) || Array.isArray(item)) {
          return `${prefix}\n${stringifyNode(item, indent + 2)}`;
        }

        return `${prefix} ${formatScalar(item)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, entryValue]) => {
        const prefix = `${" ".repeat(indent)}${key}:`;
        if (isPlainObject(entryValue) || Array.isArray(entryValue)) {
          return `${prefix}\n${stringifyNode(entryValue, indent + 2)}`;
        }

        return `${prefix} ${formatScalar(entryValue)}`;
      })
      .join("\n");
  }

  return `${" ".repeat(indent)}${formatScalar(value)}`;
}

/**
 * Split markdown text into parsed frontmatter and body content.
 *
 * @param {string} text
 * @returns {{ frontmatter: Record<string, any>, body: string }}
 */
export function splitFrontmatter(text: string): { frontmatter: FrontmatterObject; body: string } {
  const normalized = text.replaceAll("\r\n", "\n");

  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized.trimStart() };
  }

  const endMarker = normalized.indexOf("\n---\n", 4);
  if (endMarker === -1) {
    throw new Error("Unterminated frontmatter block");
  }

  const rawFrontmatter = normalized.slice(4, endMarker);
  const body = normalized.slice(endMarker + 5).trimStart();
  const lines = rawFrontmatter.split("\n");
  const parsed = parseBlock(lines, 0, 0);
  const frontmatter = isPlainObject(parsed.value) ? parsed.value : {};

  return { frontmatter, body };
}

/**
 * Serialize frontmatter back into a markdown-compatible fenced block.
 *
 * @param {Record<string, any>} frontmatter
 * @returns {string}
 */
export function stringifyFrontmatter(frontmatter: Record<string, unknown>): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return "";
  }

  return `---\n${stringifyNode(frontmatter as FrontmatterObject)}\n---\n\n`;
}

/**
 * Merge frontmatter recursively while deduplicating array entries.
 *
 * @param {any} [baseValue={}]
 * @param {any} [nextValue={}]
 * @returns {any}
 */
export function mergeFrontmatter(baseValue: unknown = {}, nextValue: unknown = {}): unknown {
  if (Array.isArray(baseValue) && Array.isArray(nextValue)) {
    const seen = new Set();
    const merged: unknown[] = [];

    for (const item of [...baseValue, ...nextValue]) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }

    return merged;
  }

  if (isPlainObject(baseValue) && isPlainObject(nextValue)) {
    const merged = { ...baseValue };

    for (const [key, value] of Object.entries(nextValue)) {
      if (key in merged) {
        merged[key] = mergeFrontmatter(merged[key], value) as FrontmatterValue;
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  return nextValue;
}
