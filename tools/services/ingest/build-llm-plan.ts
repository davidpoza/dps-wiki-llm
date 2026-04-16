import type {
  AnswerContextDoc,
  LlmSourceNote,
  MutationPlan,
  NormalizedSourcePayload
} from "../../lib/contracts.js";
import type { ChatCompletionRequest } from "../../lib/llm.js";

const ALLOWED_PAGE_PREFIXES = [
  "wiki/concepts/",
  "wiki/entities/",
  "wiki/topics/",
  "wiki/analyses/"
] as const;

export { ALLOWED_PAGE_PREFIXES };

function slugFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

function wikiLinkForDoc(doc: Pick<AnswerContextDoc, "title" | "path">): string {
  const slug = slugFromPath(doc.path);
  return doc.title ? `[[${slug}|${doc.title}]]` : `[[${slug}]]`;
}

function compactLines(values: (string | undefined | null)[]): string {
  return values.filter((v): v is string => typeof v === "string" && Boolean(v.trim())).join("\n");
}

/**
 * Build a short, dense search query combining the source title, summary, and
 * first few extracted claims — used to retrieve wiki context docs.
 */
export function buildWikiContextQuery(
  sourcePayload: NormalizedSourcePayload,
  sourceNote: LlmSourceNote
): string {
  return compactLines([
    sourcePayload.title,
    sourceNote.summary,
    ...(sourceNote.extracted_claims ?? [])
  ])
    .replace(/\s+/g, " ")
    .slice(0, 1000);
}

/**
 * Build the ChatCompletionRequest that asks the LLM to produce a MutationPlan
 * with grounded updates to concepts/entities/topics/analyses.
 */
export function ingestPlanRequest(
  sourcePayload: NormalizedSourcePayload,
  baselinePlan: MutationPlan,
  wikiContextDocs: AnswerContextDoc[]
): ChatCompletionRequest {
  const baselineSourceNotePath = baselinePlan.page_actions?.[0]?.path;
  const baselineSourceNotePayload = baselinePlan.page_actions?.[0]?.payload;
  const baselineSourceNoteTitle =
    baselineSourceNotePayload?.title || sourcePayload.title;
  const baselineSourceNoteSlug = baselineSourceNotePath
    ? slugFromPath(baselineSourceNotePath)
    : null;
  const baselineSourceNoteLink =
    baselineSourceNoteSlug && baselineSourceNoteTitle
      ? `[[${baselineSourceNoteSlug}|${baselineSourceNoteTitle}]]`
      : baselineSourceNoteTitle
        ? `[[${baselineSourceNoteTitle}]]`
        : null;
  const sourceRefs = [sourcePayload.raw_path, baselineSourceNotePath].filter(
    Boolean
  );
  const supportingWikiNotes = wikiContextDocs.map((doc) => ({
    path: doc.path,
    title: doc.title,
    doc_type: doc.doc_type,
    link: wikiLinkForDoc(doc),
    body: doc.body
  }));
  const supportingWikiLinks = [
    ...new Set(
      supportingWikiNotes
        .map((doc) => doc.link)
        .filter((l): l is string => Boolean(l))
    )
  ];

  return {
    stream: false,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You produce only valid JSON matching the Mutation Plan contract.",
          "This plan may be applied automatically and must not include a create action for the baseline source note.",
          // ── language ──────────────────────────────────────────────────────────
          "Write all generated text content (titles, facts, descriptions, section values, summaries) in Spanish. Do NOT translate proper nouns, names of people, companies, tools, books, films, articles, or any other named entity — keep them in their original form.",
          // ── knowledge boundary ────────────────────────────────────────────────
          "For concepts, entities, topics, and analyses, use only the provided wiki_context as knowledge support.",
          "Do not add model-prior, web-prior, or raw-content facts that are not present in wiki_context.",
          "wiki_context may include the newly created baseline source note and other existing wiki sources, concepts, topics, and entities.",
          // ── path rules ────────────────────────────────────────────────────────
          "Every page_actions[].path must start exactly with one of: wiki/concepts/, wiki/entities/, wiki/topics/, or wiki/analyses/, except for one narrow update to the exact baseline source note path provided by source_note_update_allowed_path.",
          "Never write directly under wiki/, for example use wiki/concepts/servidor-lean.md instead of wiki/servidor-lean.md.",
          "Only propose small grounded changes under those allowed page path prefixes.",
          // ── link format and integrity ─────────────────────────────────────────
          "All internal wiki links must use the format [[kebab-case-filename|Nombre legible]], where kebab-case-filename is the last path segment of the target file without the .md extension (e.g. [[servidor-lean|Lean Server]], [[gestion-del-conocimiento|Gestión del Conocimiento]]).",
          "For existing notes: copy the link exactly from allowed_supporting_wiki_links. For new notes you create in this plan: derive the slug from the last segment of their page_actions[].path without .md, and use their payload.title as the display name.",
          "Never construct a wiki link from memory or approximation. If you cannot find an exact match in allowed_supporting_wiki_links or in the page_actions of this plan, omit the link entirely.",
          // ── topics ────────────────────────────────────────────────────────────
          "Before creating a new topic, check wiki_context.supporting_notes for existing topics with overlapping scope. Prefer updating an existing topic over creating a redundant one.",
          "When the source has a clear reusable domain or theme, create or update a topic under wiki/topics/ for that domain.",
          "Topic file names must be broad and reusable in kebab-case Spanish (e.g., productividad.md, inteligencia-artificial.md, gestion-del-conocimiento.md). Never include source titles, years, event names, or overly specific terms in topic filenames.",
          // ── linked notes ──────────────────────────────────────────────────────
          "Every created or updated concept, entity, topic, or analysis must include the baseline source note link in its Sources section when the change is grounded in this source.",
          "If any page_action has action create or update (for notes other than the baseline source note), you MUST include an update action on the baseline source note that lists ALL those created/updated notes in the Linked Notes section using their exact [[Title]] links.",
          "The baseline source note update may only use action update and payload.sections.Linked Notes; do not modify Summary, Raw Context, Extracted Claims, frontmatter, title, or other sections.",
          // ── quality ───────────────────────────────────────────────────────────
          "Do not write raw content dumps. Prefer noop or empty page_actions when the source lacks reusable knowledge.",
          "Every write action must include an idempotency_key and source_refs must include the raw_path and baseline source note path when available."
        ]
          .filter((line) => !line.startsWith("//"))
          .join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            wiki_context: {
              baseline_source_note: {
                path: baselineSourceNotePath,
                title: baselineSourceNoteTitle,
                link: baselineSourceNoteLink,
                sections: baselineSourceNotePayload?.sections ?? {}
              },
              supporting_notes: supportingWikiNotes
            },
            baseline_mutation_plan_metadata: {
              plan_id: baselinePlan.plan_id,
              operation: baselinePlan.operation,
              summary: baselinePlan.summary,
              source_refs: sourceRefs
            },
            allowed_page_path_prefixes: ALLOWED_PAGE_PREFIXES,
            source_note_update_allowed_path: baselineSourceNotePath,
            source_note_update_allowed_sections: ["Linked Notes"],
            baseline_source_note_link: baselineSourceNoteLink,
            allowed_supporting_wiki_links: supportingWikiLinks,
            knowledge_boundary:
              "Concepts, entities, topics, and analyses must be derived only from wiki_context. They may use any source, concept, topic, or entity present in wiki_context.supporting_notes. If the needed content is not in wiki_context, return no-op actions.",
            link_integrity_rule:
              "Every [[wiki link]] must exactly match an entry in allowed_supporting_wiki_links (for existing notes) OR the payload.title of a note you create in this same plan. No invented or approximated links.",
            invalid_page_path_examples: [
              "wiki/lean-server.md",
              "wiki/example.md",
              "wiki/sources/other-source.md"
            ],
            required_json_shape: {
              plan_id: `plan-${sourcePayload.source_id}-llm-ingest-review`,
              operation: "ingest",
              summary: "Plan LLM auto-aplicado para actualizaciones reutilizables del wiki",
              source_refs: sourceRefs,
              page_actions: [
                {
                  path: "wiki/concepts/ejemplo-concepto.md",
                  action: "noop",
                  doc_type: "concept",
                  change_type: "fact",
                  idempotency_key: `${sourcePayload.source_id}:wiki/concepts/ejemplo-concepto.md`,
                  payload: {
                    title: "Ejemplo Concepto",
                    sections: {
                      Facts: ["Hecho reutilizable fundamentado en la fuente."],
                      Sources: baselineSourceNoteLink ? [baselineSourceNoteLink] : []
                    },
                    related_links: []
                  }
                },
                {
                  path: "wiki/topics/tema-general.md",
                  action: "noop",
                  doc_type: "topic",
                  change_type: "fact",
                  idempotency_key: `${sourcePayload.source_id}:wiki/topics/tema-general.md`,
                  payload: {
                    title: "Tema General",
                    sections: {
                      Facts: ["Dato relevante del tema."],
                      Sources: baselineSourceNoteLink ? [baselineSourceNoteLink] : []
                    },
                    related_links: []
                  }
                },
                {
                  path: baselineSourceNotePath,
                  action: "noop",
                  doc_type: "source",
                  change_type: "new_link",
                  idempotency_key: `${sourcePayload.source_id}:source-linked-notes`,
                  payload: {
                    sections: {
                      "Linked Notes": [
                        "[[ejemplo-concepto|Ejemplo Concepto]]",
                        "[[tema-general|Tema General]]"
                      ]
                    }
                  }
                }
              ],
              index_updates: [],
              post_actions: { reindex: true, commit: true }
            }
          },
          null,
          2
        )
      }
    ]
  };
}
