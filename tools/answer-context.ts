#!/usr/bin/env node

import fs from "node:fs/promises";

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import type { AnswerContextDoc, AnswerContextPacket, AnswerRecord, SearchResult, SearchResultItem } from "./lib/contracts.js";
import { resolveVaultRoot, resolveWithinRoot } from "./lib/fs-utils.js";
import { splitFrontmatter } from "./lib/frontmatter.js";
import { slugify, stableHash } from "./lib/text.js";

interface AnswerContextInput {
  question: string;
  retrieval: SearchResult;
  answer_record?: AnswerRecord;
  output_id?: string;
  output_path?: string;
  should_review_for_feedback?: boolean;
}

/**
 * Read retrieved wiki notes and build the deterministic context packet consumed by an LLM answer node.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSearchItem(item: unknown, index: number): SearchResultItem {
  if (!isRecord(item)) {
    throw new Error(`retrieval.results[${index}] must be an object`);
  }

  const itemPath = stringValue(item.path);
  if (!itemPath) {
    throw new Error(`retrieval.results[${index}] requires path`);
  }

  if (!itemPath.startsWith(`${SYSTEM_CONFIG.paths.wikiDir}/`)) {
    throw new Error(`retrieval.results[${index}] must reference wiki/: ${itemPath}`);
  }

  if (itemPath.replaceAll("\\", "/").split("/").includes("..")) {
    throw new Error(`retrieval.results[${index}] rejects path traversal: ${itemPath}`);
  }

  return {
    path: itemPath,
    title: stringValue(item.title) || itemPath,
    doc_type: stringValue(item.doc_type) || "unknown",
    score: typeof item.score === "number" ? item.score : Number(item.score || 0)
  };
}

function normalizeSearchResult(input: unknown): SearchResult {
  if (!isRecord(input)) {
    throw new Error("retrieval must be a JSON object");
  }

  const query = stringValue(input.query) || SYSTEM_CONFIG.answer.defaultQuestion;
  const results = Array.isArray(input.results) ? input.results.map(normalizeSearchItem) : [];

  return {
    query,
    limit: typeof input.limit === "number" ? input.limit : results.length,
    db_path: stringValue(input.db_path),
    results
  };
}

function normalizeInput(input: unknown): AnswerContextInput {
  if (!isRecord(input)) {
    throw new Error("answer-context input must be a JSON object");
  }

  const retrieval = normalizeSearchResult(isRecord(input.retrieval) ? input.retrieval : input);
  const question = stringValue(input.question) || retrieval.query || SYSTEM_CONFIG.answer.defaultQuestion;
  const answerRecord = isRecord(input.answer_record) ? normalizeAnswerRecord(input.answer_record, question, retrieval) : undefined;

  return {
    question,
    retrieval,
    answer_record: answerRecord,
    output_id: stringValue(input.output_id),
    output_path: stringValue(input.output_path),
    should_review_for_feedback:
      typeof input.should_review_for_feedback === "boolean" ? input.should_review_for_feedback : undefined
  };
}

function defaultOutputId(question: string): string {
  return `out-${new Date().toISOString().slice(0, 10)}-answer-${stableHash(
    question,
    SYSTEM_CONFIG.answer.outputIdHashLength
  )}`;
}

function defaultOutputPath(question: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(question, SYSTEM_CONFIG.answer.outputSlugMaxLength, "answer");
  return `${SYSTEM_CONFIG.paths.outputsDir}/${date}-${slug}.md`;
}

function normalizeAnswerRecord(input: Record<string, unknown>, question: string, retrieval: SearchResult): AnswerRecord {
  const outputId = stringValue(input.output_id) || defaultOutputId(question);
  const outputPath = stringValue(input.output_path) || defaultOutputPath(question);
  const evidenceUsed = Array.isArray(input.evidence_used)
    ? input.evidence_used.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : retrieval.results.map((item) => item.path);

  return {
    output_id: outputId,
    question: stringValue(input.question) || question,
    output_path: outputPath,
    evidence_used: evidenceUsed,
    should_review_for_feedback:
      typeof input.should_review_for_feedback === "boolean" ? input.should_review_for_feedback : true
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const input = normalizeInput(await readJsonInput(args.input));
  const answerRecord =
    input.answer_record ||
    normalizeAnswerRecord(
      {
        output_id: input.output_id,
        output_path: input.output_path,
        should_review_for_feedback: input.should_review_for_feedback
      },
      input.question,
      input.retrieval
    );
  const contextDocs: AnswerContextDoc[] = [];

  for (const item of input.retrieval.results) {
    const absolutePath = resolveWithinRoot(vaultRoot, item.path);
    const raw = await fs.readFile(absolutePath, "utf8");
    const { body } = splitFrontmatter(raw);
    contextDocs.push({
      ...item,
      body: body.slice(0, SYSTEM_CONFIG.answer.contextBodyMaxLength)
    });
  }

  const packet: AnswerContextPacket = {
    question: input.question,
    retrieval: input.retrieval,
    context_docs: contextDocs,
    answer_record: answerRecord
  };

  writeJsonStdout(packet, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
