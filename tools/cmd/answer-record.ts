#!/usr/bin/env node

import { SYSTEM_CONFIG } from "../config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "../lib/infra/cli.js";
import { createLogger } from "../lib/infra/logger.js";
import type { AnswerRecord, AnswerRecordInput } from "../lib/core/contracts.js";
import { resolveVaultRoot, resolveWithinRoot, writeTextFile } from "../lib/storage/fs-utils.js";
import { slugify, stableHash } from "../lib/infra/text.js";
import { isRecord, stringValue } from "../lib/core/type-guards.js";

interface AnswerRecordOutput {
  record: AnswerRecord;
  output_path: string;
  wrote: boolean;
}

/**
 * Persist a generated answer artifact and emit the canonical answer record for feedback evaluation.
 */

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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function normalizeInput(input: unknown): AnswerRecordInput {
  if (!isRecord(input)) {
    throw new Error("answer-record input must be a JSON object");
  }

  const nestedRecord = isRecord(input.answer_record) ? input.answer_record : {};
  const question = stringValue(input.question) || stringValue(nestedRecord.question);
  const answer =
    stringValue(input.answer) ||
    stringValue(input.text) ||
    stringValue(input.response) ||
    stringValue(input.output) ||
    stringValue(input.content);

  if (!question) {
    throw new Error("answer-record input requires question");
  }

  if (!answer) {
    throw new Error("answer-record input requires answer");
  }

  const evidenceUsed = stringArray(input.evidence_used);
  const nestedEvidenceUsed = stringArray(nestedRecord.evidence_used);

  return {
    output_id: stringValue(input.output_id) || stringValue(nestedRecord.output_id),
    question,
    answer,
    output_path: stringValue(input.output_path) || stringValue(nestedRecord.output_path),
    evidence_used: evidenceUsed.length > 0 ? evidenceUsed : nestedEvidenceUsed,
    should_review_for_feedback:
      typeof input.should_review_for_feedback === "boolean"
        ? input.should_review_for_feedback
        : typeof nestedRecord.should_review_for_feedback === "boolean"
          ? nestedRecord.should_review_for_feedback
          : true
  };
}

function assertOutputPath(outputPath: string): void {
  if (
    !outputPath.startsWith(`${SYSTEM_CONFIG.paths.outputsDir}/`) ||
    outputPath.replaceAll("\\", "/").split("/").includes("..")
  ) {
    throw new Error(`answer-record output_path must stay under ${SYSTEM_CONFIG.paths.outputsDir}/: ${outputPath}`);
  }
}

function renderAnswerArtifact(record: AnswerRecord, answer: string): string {
  const lines = [
    "---",
    'type: "answer_record"',
    `output_id: "${record.output_id}"`,
    `created_at: "${new Date().toISOString()}"`,
    `should_review_for_feedback: ${record.should_review_for_feedback}`,
    "---",
    "",
    `# Answer: ${record.question}`,
    "",
    "## Question",
    record.question,
    "",
    "## Answer",
    answer.trim(),
    ""
  ];

  if (record.evidence_used.length > 0) {
    lines.push("## Evidence Used");
    for (const item of record.evidence_used) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  lines.push("## Feedback");
  lines.push(`- should_review_for_feedback: ${record.should_review_for_feedback}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("answer-record");
  const vaultRoot = resolveVaultRoot(args.vault);
  log.info("answer-record started");
  const input = normalizeInput(await readJsonInput(args.input));
  const record: AnswerRecord = {
    output_id: input.output_id || defaultOutputId(input.question),
    question: input.question,
    output_path: input.output_path || defaultOutputPath(input.question),
    evidence_used: input.evidence_used || [],
    should_review_for_feedback: input.should_review_for_feedback ?? true
  };

  assertOutputPath(record.output_path);

  if (args.write) {
    await writeTextFile(resolveWithinRoot(vaultRoot, record.output_path), renderAnswerArtifact(record, input.answer));
  }

  const output: AnswerRecordOutput = {
    record,
    output_path: record.output_path,
    wrote: args.write
  };

  log.info({ output_path: record.output_path, wrote: args.write }, "answer-record completed");
  writeJsonStdout(output, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
