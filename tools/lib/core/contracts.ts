export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type DocType = "concept" | "entity" | "topic" | "source" | "analysis" | "index" | "unknown" | string;
export type PageActionKind = "create" | "update" | "noop";
export type IndexUpdateAction = "create" | "update" | "noop" | string;
export type Operation = "ingest" | "feedback" | "lint" | "health-check" | "manual" | string;
export type FeedbackDecision = "none" | "output_only" | "propagate";
export type FeedbackOutcome = "applied" | "rejected" | "deferred";
export type Severity = "critical" | "warning" | "suggestion";

export interface NormalizedSourcePayload {
  source_id: string;
  source_kind: "web" | "voice" | "bookmark" | "note" | "other" | string;
  captured_at: string;
  raw_path: string;
  title: string;
  content: string;
  canonical_url?: string;
  author?: string;
  language?: string;
  checksum?: string;
  metadata?: JsonObject;
  source_note?: LlmSourceNote;
}

export interface LlmSourceNote {
  summary: string;
  raw_context: string;
  extracted_claims?: string[];
  open_questions?: string[];
  generated_by?: string;
  model?: string;
}

export interface MarkdownPayload {
  title?: string;
  frontmatter?: Record<string, unknown>;
  sections?: Record<string, string[] | string | unknown>;
  /** Remove specific bullet items from sections (matched after normalization). */
  sections_remove?: Record<string, string[]>;
  related_links?: string[];
  change_reason?: string;
}

export interface MutationPageAction {
  path: string;
  action: PageActionKind;
  doc_type?: DocType;
  change_type?: string;
  idempotency_key?: string;
  payload?: MarkdownPayload;
}

export interface MutationIndexUpdate {
  path: string;
  action?: IndexUpdateAction;
  change_type?: string;
  section?: string;
  entries_to_add?: string[];
}

export interface MutationPlan {
  plan_id: string;
  operation?: Operation;
  summary?: string;
  source_refs?: string[];
  page_actions: MutationPageAction[];
  index_updates?: MutationIndexUpdate[];
  post_actions?: {
    reindex?: boolean;
    commit?: boolean;
  };
}

export interface MutationResult {
  plan_id: string;
  status: "applied";
  created: string[];
  updated: string[];
  skipped: string[];
  idempotent_hits: string[];
}

export interface SearchResultItem {
  path: string;
  title: string;
  doc_type: string;
  score: number;
}

export interface SearchResult {
  query: string;
  limit: number;
  mode?: string;
  db_path?: string;
  results: SearchResultItem[];
}

export interface AnswerRecord {
  output_id: string;
  question: string;
  output_path: string;
  evidence_used: string[];
  should_review_for_feedback: boolean;
}

export interface AnswerContextDoc extends SearchResultItem {
  body: string;
}

export interface AnswerContextPacket {
  question: string;
  retrieval: SearchResult;
  context_docs: AnswerContextDoc[];
  answer_record: AnswerRecord;
}

export interface AnswerRecordInput {
  output_id?: string;
  question: string;
  answer: string;
  output_path?: string;
  evidence_used?: string[];
  should_review_for_feedback?: boolean;
}

export interface FeedbackCandidateItem {
  item_id: string;
  target_note: string;
  change_type: string;
  novelty: string;
  source_support: string[];
  proposed_content: string;
  section: string;
  action: PageActionKind;
  related_links: string[];
  frontmatter: Record<string, unknown>;
  outcome: FeedbackOutcome;
}

export interface FeedbackRecord {
  output_id: string;
  decision: FeedbackDecision;
  reason: string;
  source_refs: string[];
  candidate_items: FeedbackCandidateItem[];
  affected_notes: string[];
  mutation_plan_ref?: string;
}

export interface MaintenanceFinding {
  severity: Severity;
  path: string;
  issue_type: string;
  description: string;
  recommended_action: string;
  auto_fixable: boolean;
  [key: string]: unknown;
}

export interface MaintenanceResult {
  run_id: string;
  kind: "lint" | "health-check";
  stats: {
    docs: number;
    findings: number;
    critical: number;
    warning: number;
    suggestion: number;
  };
  findings: MaintenanceFinding[];
  missing_pages?: MissingPage[];
  report_path?: string;
  summary_path?: string;
}

export interface MissingPage {
  target: string;
  referenced_from: string[];
}

export interface CommitInput {
  operation: Operation;
  summary: string;
  source_refs: string[];
  affected_notes: string[];
  paths_to_stage: string[];
  feedback_record_ref: string | null;
  mutation_result_ref: string | null;
  commit_message: string | null;
}

export interface CommitResult {
  operation: Operation;
  commit_created: boolean;
  commit_sha: string | null;
  change_log_path: string | null;
  staged_paths: string[];
}

export interface CliArgs {
  _: string[];
  vault: string;
  input: string | null;
  db: string | null;
  limit: number | null;
  write: boolean;
  pretty: boolean;
}

export interface MarkdownSection {
  name: string;
  content: string;
}

export interface ParsedMarkdown {
  title: string;
  preamble: string;
  sections: MarkdownSection[];
}

export interface WikiLink {
  raw: string;
  normalized: string;
}

export interface WikiDoc {
  absolutePath: string;
  relativePath: string;
  raw: string;
  body: string;
  frontmatter: Record<string, unknown>;
  title: string;
  docType: string;
  updatedAt: string;
  lineCount: number;
  sectionCount: number;
  sections: MarkdownSection[];
  sectionMap: Map<string, MarkdownSection>;
  wikiLinks: WikiLink[];
  aliases: Set<string>;
}

export interface WikiGraph {
  aliasMap: Map<string, string[]>;
  pathMap: Map<string, WikiDoc>;
  inboundCounts: Map<string, number>;
  resolvedLinks: Map<string, string[]>;
  brokenLinks: Map<string, WikiLink[]>;
  ambiguousTargets: Map<string, Array<WikiLink & { matches: string[] }>>;
}

export interface RenderRuntime {
  updatedDate?: string;
  updatedBy?: string;
}
