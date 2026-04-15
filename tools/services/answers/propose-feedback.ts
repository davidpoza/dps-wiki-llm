import type { AnswerContextPacket, AnswerRecord, FeedbackRecord } from "../../lib/contracts.js";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../lib/llm.js";
import { chatText, extractJson } from "../../lib/llm.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Build the ChatCompletionRequest that asks the LLM to propose a FeedbackRecord
 * based on the answer and the wiki evidence used.
 */
export function feedbackRequest(
  packet: AnswerContextPacket,
  answer: string,
  answerRecord: AnswerRecord
): ChatCompletionRequest {
  const contextDocs = Array.isArray(packet.context_docs) ? packet.context_docs : [];
  return {
    stream: false,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You produce only valid JSON matching the Feedback Record contract.",
          "Valid decision values are none, output_only, and propagate.",
          "Use propagate only for small reusable wiki changes grounded in the evidence_used paths.",
          "Every candidate item must include item_id, target_note, change_type, novelty, source_support, proposed_content, and outcome.",
          "Use outcome applied only for changes you recommend a human approve; otherwise use deferred or rejected.",
          "Do not copy the whole answer into the wiki."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            output_id: answerRecord.output_id,
            answer_record: answerRecord,
            answer,
            source_refs: answerRecord.evidence_used ?? [],
            context_docs: contextDocs.map((doc) => ({
              path: doc.path,
              title: doc.title,
              doc_type: doc.doc_type,
              body: doc.body
            })),
            required_json_shape: {
              output_id: answerRecord.output_id,
              decision: "none|output_only|propagate",
              reason: "short reason",
              source_refs: answerRecord.evidence_used ?? [],
              candidate_items: [],
              affected_notes: []
            }
          },
          null,
          2
        )
      }
    ]
  };
}

/**
 * Parse and normalize the LLM feedback response into a FeedbackRecord.
 * Fills in missing required fields from the answerRecord where possible.
 */
export function parseFeedback(
  response: ChatCompletionResponse,
  answerRecord: AnswerRecord
): FeedbackRecord {
  const proposed = extractJson(chatText(response, "LLM feedback"));
  if (!isRecord(proposed)) {
    throw new Error("LLM feedback response must be a JSON object");
  }
  if (!proposed.output_id) {
    proposed.output_id = answerRecord.output_id;
  }
  if (!Array.isArray(proposed.source_refs)) {
    proposed.source_refs = answerRecord.evidence_used ?? [];
  }
  if (!Array.isArray(proposed.candidate_items)) {
    proposed.candidate_items = [];
  }
  if (!Array.isArray(proposed.affected_notes)) {
    const items = proposed.candidate_items as unknown[];
    proposed.affected_notes = items
      .filter((item) => isRecord(item) && item.outcome === "applied")
      .map((item) => (isRecord(item) ? item.target_note : null))
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }
  return proposed as unknown as FeedbackRecord;
}
