import type { FeedbackDecision, FeedbackOutcome, PageActionKind, Severity } from "./lib/contracts.js";

export const SYSTEM_CONFIG = {
  paths: {
    rawDir: "raw",
    wikiDir: "wiki",
    outputsDir: "outputs",
    stateDir: "state",
    dbPath: "state/kb.db",
    rootIndexPath: "INDEX.md",
    runtimeDir: "state/runtime",
    lockDir: "state/locks",
    idempotencyLedgerPath: "state/runtime/idempotency-keys.json",
    feedbackDir: "state/feedback",
    maintenanceDir: "state/maintenance",
    changeLogDir: "state/change-log"
  },
  cli: {
    defaultVault: () => process.cwd(),
    defaultSearchLimit: 8,
    prettyJson: true
  },
  database: {
    experimentalWarningText: "SQLite is an experimental feature",
    pragmas: [
      "PRAGMA journal_mode = WAL;",
      "PRAGMA synchronous = NORMAL;",
      "PRAGMA foreign_keys = ON;",
      "PRAGMA temp_store = MEMORY;"
    ],
    docsTableSql: `
    CREATE TABLE IF NOT EXISTS docs (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      updated_at TEXT,
      body TEXT NOT NULL
    );
  `,
    docsFtsTableSql: `
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      title,
      body,
      content='docs',
      content_rowid='id'
    );
  `,
    rebuildFtsSql: "INSERT INTO docs_fts(docs_fts) VALUES('rebuild');"
  },
  mutation: {
    validActions: ["create", "update", "noop"] satisfies PageActionKind[],
    applyUpdateActor: "apply-update.ts",
    defaultIndexSection: "Entries",
    defaultIndexTitle: "Index"
  },
  ingest: {
    sourceIdHashLength: 10,
    sourceSlugMaxLength: 72,
    summaryMaxLength: 240,
    rawContextMaxLength: 1200,
    defaultLanguage: "unknown",
    defaultSourceKind: "note",
    sourceKindFolders: {
      bookmarks: "bookmark",
      voice: "voice",
      web: "web",
      inbox: "note"
    } as Record<string, string>
  },
  answer: {
    outputIdHashLength: 8,
    outputSlugMaxLength: 64,
    contextBodyMaxLength: 4000,
    defaultQuestion: "What should I know from the current wiki state?"
  },
  feedback: {
    validDecisions: ["none", "output_only", "propagate"] satisfies FeedbackDecision[],
    validOutcomes: ["applied", "rejected", "deferred"] satisfies FeedbackOutcome[],
    artifactSlugMaxLength: 80,
    defaultCandidateAction: "update" satisfies PageActionKind,
    changeTypeSections: {
      net_new_fact: "Facts",
      fact: "Facts",
      correction: "Facts",
      better_wording: "Interpretation",
      new_link: "Related",
      open_question: "Open Questions",
      split_suggestion: "Open Questions"
    } as Record<string, string>,
    defaultSection: "Interpretation"
  },
  commit: {
    defaultOperation: "manual",
    changeLogSlugMaxLength: 60,
    rawPathPrefix: "raw/"
  },
  markdown: {
    bulletSections: [
      "facts",
      "related",
      "sources",
      "open questions",
      "extracted claims",
      "linked notes",
      "key concepts",
      "key entities",
      "relationships",
      "gaps",
      "evidence"
    ]
  },
  wiki: {
    wikiPathPrefix: "wiki/",
    markdownExtension: ".md",
    docTypeFolders: {
      concepts: "concept",
      entities: "entity",
      topics: "topic",
      sources: "source",
      analyses: "analysis",
      indexes: "index"
    } as Record<string, string>,
    typedDocTypes: ["concept", "entity", "topic", "analysis"] as readonly string[],
    requiredFrontmatterKeys: ["type", "title", "updated"] as readonly string[]
  },
  lint: {
    lineWarningThreshold: 300,
    lineCriticalThreshold: 500,
    sectionWarningThreshold: 12,
    kebabCasePattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  },
  health: {
    dayInMs: 24 * 60 * 60 * 1000,
    lowConfidenceValue: "low",
    staleLowConfidenceWarningDays: 30,
    staleLowConfidenceCriticalDays: 90,
    evidenceLikeSections: ["Facts", "Evidence", "Extracted Claims"] as readonly string[],
    sourceSupportFrontmatterKeys: ["source_ids", "source_refs"] as readonly string[],
    requiredSourceFrontmatter: {
      sourceRef: "source_ref",
      capturedAt: "captured_at"
    }
  },
  maintenance: {
    severityOrder: {
      critical: 0,
      warning: 1,
      suggestion: 2
    } satisfies Record<Severity, number>
  },
  logging: {
    dir: (vaultRoot: string) => `${vaultRoot}/state/logs`,
    level: "info",
    maxSize: "10m",
    frequency: "daily"
  }
} as const;

export function configuredSet<T extends string>(values: readonly T[]): ReadonlySet<T> {
  return new Set(values);
}
