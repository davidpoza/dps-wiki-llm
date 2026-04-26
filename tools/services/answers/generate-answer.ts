import type { AnswerContextPacket } from "../../lib/core/contracts.js";
import type { ChatCompletionRequest } from "../../lib/infra/llm.js";
import { answerTemperature } from "../../lib/infra/llm.js";

/**
 * Build the ChatCompletionRequest that asks the LLM to answer a question using
 * only the provided wiki context docs.
 */
export function answerRequest(packet: AnswerContextPacket): ChatCompletionRequest {
  const contextDocs = Array.isArray(packet.context_docs) ? packet.context_docs : [];
  return {
    stream: false,
    temperature: answerTemperature(),
    messages: [
      {
        role: "system",
        content: [
          "You answer questions using only the provided markdown wiki context.",
          "If the context is insufficient, say what is missing instead of inventing facts.",
          "Do not mutate the wiki and do not claim to have updated files.",
          "Return concise markdown suitable for an answer artifact."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            question: packet.question,
            evidence_used: packet.answer_record?.evidence_used ?? [],
            context_docs: contextDocs.map((doc) => ({
              path: doc.path,
              title: doc.title,
              doc_type: doc.doc_type,
              body: doc.body
            }))
          },
          null,
          2
        )
      }
    ]
  };
}
