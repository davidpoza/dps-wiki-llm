import type { LlmSourceNote, NormalizedSourcePayload } from "../../lib/core/contracts.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse
} from "../../lib/infra/llm.js";
import { chatText, extractJson } from "../../lib/infra/llm.js";
import { isRecord } from "../../lib/core/type-guards.js";

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`LLM source note must include non-empty ${field}`);
  }
  return value.trim();
}

function stringArrayField(
  record: Record<string, unknown>,
  field: string,
  required: boolean
): string[] {
  const value = record[field];
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) {
    throw new Error(`LLM source note must include ${field}[]`);
  }
  if (value.some((item) => typeof item !== "string")) {
    throw new Error(`LLM source note ${field}[] must contain only strings`);
  }
  return value.map((item: string) => item.trim()).filter(Boolean);
}

/**
 * Build the ChatCompletionRequest that asks the LLM to clean and summarize a
 * source payload into a structured source note (summary, raw_context, claims).
 */
export function sourceNoteRequest(
  sourcePayload: NormalizedSourcePayload
): ChatCompletionRequest {
  return {
    stream: false,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You produce only valid JSON for a cleaned source note.",
          "Clean and normalize the source content without losing materially useful information.",
          "Do not invent facts, links, names, dates, numbers, or claims not present in the source.",
          "Remove only boilerplate, navigation, ads, duplicated text, formatting noise, and irrelevant wrapper text.",
          "Do not propose wiki mutations. This step only prepares the wiki/sources note content.",
          "Write all generated text (summary, raw_context, extracted_claims, open_questions) in Spanish, regardless of the source language. Do NOT translate proper nouns, names of people, companies, tools, books, films, or articles — keep them in their original form.",
          "Return a JSON object with summary, raw_context, extracted_claims, and open_questions."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            source_payload: sourcePayload,
            required_json_shape: {
              summary: "Faithful concise summary of the source.",
              raw_context:
                "Cleaned normalized source content preserving all materially useful information.",
              extracted_claims: ["Grounded claim from the source."],
              open_questions: [
                "Optional unresolved ambiguity from the source."
              ]
            },
            constraints: [
              "Preserve concrete names, dates, numbers, URLs, tool names, decisions, and caveats from the source.",
              "Use extracted_claims only for claims directly supported by the source.",
              "Use open_questions only for unresolved gaps present in or implied by the source.",
              "If the source is thin, keep raw_context short but still faithful."
            ]
          },
          null,
          2
        )
      }
    ]
  };
}

/**
 * Parse and validate the LLM response for a source note.
 * Throws if the response is structurally invalid.
 */
export function parseSourceNote(
  response: ChatCompletionResponse,
  request: ChatCompletionRequest
): LlmSourceNote {
  const proposed = extractJson(chatText(response, "LLM source note"));
  if (!isRecord(proposed)) {
    throw new Error("LLM source note must be an object");
  }
  return {
    summary: stringField(proposed, "summary"),
    raw_context: stringField(proposed, "raw_context"),
    extracted_claims: stringArrayField(proposed, "extracted_claims", true),
    open_questions: stringArrayField(proposed, "open_questions", false),
    generated_by: "llm",
    model: response.model ?? request.model
  };
}
