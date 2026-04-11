import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  conceptNote,
  readFile,
  readJson,
  runCommand,
  runTool,
  sourceNote,
  tempDir,
  writeFile,
  writeJson
} from "./helpers.js";

async function createVault() {
  const vault = await tempDir("dps-wiki-llm-vault-");

  await writeFile(
    path.join(vault, "wiki/concepts/model-context-protocol.md"),
    conceptNote(
      "Model Context Protocol",
      `## Summary\n[[Source A]] grounds this note.\n\n## Facts\n- MCP connects tools and context.\n\n## Sources\n- [[Source A]]`
    )
  );
  await writeFile(
    path.join(vault, "wiki/sources/source-a.md"),
    sourceNote(
      "Source A",
      `## Summary\nA source for MCP.\n\n## Raw Context\nA normalized test source.\n\n## Extracted Claims\n- MCP connects tools and context.`,
      "raw/inbox/source-a.md"
    )
  );
  await writeFile(
    path.join(vault, "wiki/indexes/root.md"),
    `---\ntype: "index"\ntitle: "Root Index"\nupdated: "2026-04-11"\n---\n\n# Root Index\n\n## Entries\n- [[Model Context Protocol]]\n`
  );
  await writeFile(path.join(vault, "INDEX.md"), "# Index\n\n## Entries\n- [[Model Context Protocol]]\n");

  return vault;
}

test("init-db, reindex, and search work together", async () => {
  const vault = await createVault();

  const init = await runTool("init-db", ["--vault", vault]);
  assert.deepEqual(init.json, { db_path: "state/kb.db", initialized: true });

  const reindex = await runTool("reindex", ["--vault", vault]);
  assert.equal(reindex.json.db_path, "state/kb.db");
  assert.equal(reindex.json.indexed, 3);
  assert.equal(reindex.json.fts_rebuilt, true);

  const search = await runTool("search", ["--vault", vault, "--limit", "5", "protocol"]);
  assert.equal(search.json.query, "protocol");
  assert.equal(search.json.limit, 5);
  assert.ok(search.json.results.some((item) => item.path === "wiki/concepts/model-context-protocol.md"));
});

test("apply-update creates, updates, updates indexes, and records idempotency", async () => {
  const vault = await createVault();
  const planPath = path.join(vault, "plan.json");

  await writeJson(planPath, {
    plan_id: "plan-apply-test",
    operation: "ingest",
    summary: "Apply update test",
    source_refs: ["raw/inbox/new-source.md"],
    page_actions: [
      {
        path: "wiki/sources/new-source.md",
        action: "create",
        doc_type: "source",
        change_type: "net_new_fact",
        idempotency_key: "src-new-source",
        payload: {
          title: "New Source",
          frontmatter: {
            type: "source",
            title: "New Source",
            source_kind: "note",
            source_ref: "raw/inbox/new-source.md",
            captured_at: "2026-04-11T00:00:00Z"
          },
          sections: {
            Summary: ["New source summary."],
            "Extracted Claims": ["A new grounded claim."]
          },
          change_reason: "Test source creation"
        }
      },
      {
        path: "wiki/concepts/model-context-protocol.md",
        action: "update",
        doc_type: "concept",
        change_type: "net_new_fact",
        idempotency_key: "src-new-source:concept",
        payload: {
          sections: {
            Facts: ["A new grounded claim."]
          },
          related_links: ["[[New Source]]"],
          change_reason: "Test concept update"
        }
      },
      {
        path: "wiki/concepts/noop.md",
        action: "noop",
        idempotency_key: "noop"
      }
    ],
    index_updates: [
      {
        path: "INDEX.md",
        action: "update",
        change_type: "index_update",
        entries_to_add: ["[[New Source]]"]
      }
    ]
  });

  const first = await runTool("apply-update", ["--vault", vault, "--input", planPath]);
  assert.equal(first.json.status, "applied");
  assert.deepEqual(first.json.created, ["wiki/sources/new-source.md"]);
  assert.ok(first.json.updated.includes("wiki/concepts/model-context-protocol.md"));
  assert.ok(first.json.updated.includes("INDEX.md"));
  assert.ok(first.json.skipped.includes("wiki/concepts/noop.md"));

  const source = await readFile(path.join(vault, "wiki/sources/new-source.md"));
  assert.match(source, /# New Source/);
  assert.match(source, /updated_by: "apply-update.ts"/);

  const ledger = await readJson(path.join(vault, "state/runtime/idempotency-keys.json"));
  assert.equal(ledger["src-new-source"].path, "wiki/sources/new-source.md");

  const second = await runTool("apply-update", ["--vault", vault, "--input", planPath]);
  assert.ok(second.json.idempotent_hits.includes("src-new-source"));
  assert.ok(second.json.idempotent_hits.includes("src-new-source:concept"));
  assert.ok(second.json.skipped.includes("wiki/sources/new-source.md"));
});

test("feedback-record writes audit artifacts and derives a mutation plan", async () => {
  const vault = await createVault();
  const inputPath = path.join(vault, "feedback.json");

  await writeJson(inputPath, {
    output_id: "out-feedback-001",
    decision: "propagate",
    reason: "Reusable grounded correction",
    source_refs: ["wiki/sources/source-a.md"],
    candidate_items: [
      {
        item_id: "item-001",
        target_note: "wiki/concepts/model-context-protocol.md",
        change_type: "correction",
        novelty: "correction",
        source_support: ["source-a"],
        proposed_content: "MCP support should be stated as tool and context integration.",
        outcome: "applied"
      },
      {
        item_id: "item-002",
        target_note: "wiki/concepts/model-context-protocol.md",
        change_type: "open_question",
        novelty: "net_new",
        source_support: ["source-a"],
        proposed_content: "Which MCP integrations are recurring in this vault?",
        outcome: "deferred"
      }
    ]
  });

  const result = await runTool("feedback-record", ["--vault", vault, "--input", inputPath]);
  assert.equal(result.json.record.decision, "propagate");
  assert.ok(result.json.record.mutation_plan_ref.endsWith("-mutation-plan.json"));

  const record = await readJson(path.join(vault, result.json.record_path));
  const plan = await readJson(path.join(vault, result.json.mutation_plan_path));
  const summary = await readFile(path.join(vault, result.json.summary_path));

  assert.equal(record.candidate_items.length, 2);
  assert.equal(plan.operation, "feedback");
  assert.equal(plan.page_actions[0].change_type, "correction");
  assert.match(summary, /Target Note \| Change Type \| Source Support \| Outcome/);
});

test("feedback-record rejects applied items without source support", async () => {
  const vault = await createVault();
  const inputPath = path.join(vault, "feedback-invalid.json");
  await writeJson(inputPath, {
    output_id: "out-invalid",
    decision: "propagate",
    candidate_items: [
      {
        target_note: "wiki/concepts/model-context-protocol.md",
        change_type: "correction",
        novelty: "correction",
        proposed_content: "Unsupported correction.",
        outcome: "applied"
      }
    ]
  });

  await assert.rejects(
    runTool("feedback-record", ["--vault", vault, "--input", inputPath]),
    /cannot be applied without source_support/
  );
});

test("lint and health-check emit structured maintenance results", async () => {
  const vault = await createVault();

  const lint = await runTool("lint", ["--vault", vault, "--no-write"]);
  assert.equal(lint.json.kind, "lint");
  assert.equal(lint.json.stats.docs, 3);
  assert.equal(lint.json.findings.length, 0);

  const health = await runTool("health-check", ["--vault", vault, "--no-write"]);
  assert.equal(health.json.kind, "health-check");
  assert.equal(health.json.stats.docs, 3);
  assert.deepEqual(health.json.missing_pages, []);
  assert.equal(health.json.findings.length, 0);
});

test("lint reports structural findings and writes report artifacts", async () => {
  const vault = await tempDir("dps-wiki-llm-lint-vault-");
  const manyLines = Array.from({ length: 505 }, (_, index) => `- line ${index + 1}`).join("\n");
  const manySections = Array.from({ length: 13 }, (_, index) => `## Section ${index + 1}\nContent ${index + 1}`).join("\n\n");

  await writeFile(
    path.join(vault, "wiki/concepts/BadName.md"),
    `# BadName\n\n${manySections}\n\n## Facts\n${manyLines}\n\n## Related\n- [[Ambiguous]]\n- [[Missing Target]]\n`
  );
  await writeFile(path.join(vault, "wiki/concepts/ambiguous.md"), conceptNote("Ambiguous", "## Summary\nFirst."));
  await writeFile(path.join(vault, "wiki/topics/ambiguous.md"), conceptNote("Ambiguous", "## Summary\nSecond."));
  await writeFile(
    path.join(vault, "wiki/indexes/empty-index.md"),
    `---\ntype: "index"\ntitle: "Empty Index"\nupdated: "2026-04-11"\n---\n\n# Empty Index\n\n## Entries\nNo links here.\n`
  );

  const lint = await runTool("lint", ["--vault", vault]);
  const issueTypes = lint.json.findings.map((finding) => finding.issue_type);

  assert.equal(lint.json.kind, "lint");
  assert.ok(lint.json.report_path.endsWith("-lint.json"));
  assert.ok(lint.json.summary_path.endsWith("-lint.md"));
  assert.ok(issueTypes.includes("oversized_page"));
  assert.ok(issueTypes.includes("too_many_sections"));
  assert.ok(issueTypes.includes("incomplete_frontmatter"));
  assert.ok(issueTypes.includes("inconsistent_name"));
  assert.ok(issueTypes.includes("broken_links"));
  assert.ok(issueTypes.includes("ambiguous_links"));
  assert.ok(issueTypes.includes("orphan_page"));
  assert.ok(issueTypes.includes("empty_index"));
  assert.ok(issueTypes.includes("duplicate_basename"));
  assert.ok(issueTypes.includes("missing_root_index"));

  const report = await readJson(path.join(vault, lint.json.report_path));
  const summary = await readFile(path.join(vault, lint.json.summary_path));
  assert.equal(report.kind, "lint");
  assert.match(summary, /# Lint Report:/);
});

test("health-check reports semantic findings and writes report artifacts", async () => {
  const vault = await tempDir("dps-wiki-llm-health-vault-");

  await writeFile(path.join(vault, "wiki/misc/unknown.md"), `# Unknown\n\n## Summary\nUnclassified note.\n`);
  await writeFile(
    path.join(vault, "wiki/concepts/unsupported.md"),
    conceptNote("Unsupported", "## Facts\n- Unsupported fact.")
  );
  await writeFile(
    path.join(vault, "wiki/analyses/no-evidence.md"),
    `---\ntype: "analysis"\ntitle: "No Evidence"\nupdated: "2026-04-11"\n---\n\n# No Evidence\n\n## Synthesis\nA claim without evidence.\n\n## Sources\n- [[Source Good]]\n`
  );
  await writeFile(
    path.join(vault, "wiki/sources/source-missing-ref.md"),
    `---\ntype: "source"\ntitle: "Source Missing Ref"\nupdated: "2026-04-11"\n---\n\n# Source Missing Ref\n\n## Summary\nA source note missing traceability fields.\n`
  );
  await writeFile(
    path.join(vault, "wiki/sources/source-good.md"),
    sourceNote("Source Good", "## Summary\nA good source.", "raw/inbox/good.md")
  );
  await writeFile(
    path.join(vault, "wiki/concepts/stale-low-confidence.md"),
    conceptNote(
      "Stale Low Confidence",
      "## Facts\n- Old but sourced.\n\n## Sources\n- [[Source Good]]",
      { confidence: "low", updated: "2000-01-01" }
    )
  );
  await writeFile(
    path.join(vault, "wiki/topics/empty-topic.md"),
    `---\ntype: "topic"\ntitle: "Empty Topic"\nupdated: "2026-04-11"\n---\n\n# Empty Topic\n\n## Summary\nTopic without hub links.\n`
  );
  await writeFile(
    path.join(vault, "wiki/concepts/missing-link.md"),
    conceptNote("Missing Link", "## Summary\n[[Missing Health Target]]")
  );

  const health = await runTool("health-check", ["--vault", vault]);
  const issueTypes = health.json.findings.map((finding) => finding.issue_type);

  assert.equal(health.json.kind, "health-check");
  assert.ok(health.json.report_path.endsWith("-health-check.json"));
  assert.ok(health.json.summary_path.endsWith("-health-check.md"));
  assert.ok(issueTypes.includes("unknown_doc_type"));
  assert.ok(issueTypes.includes("unsupported_claims"));
  assert.ok(issueTypes.includes("analysis_without_evidence"));
  assert.ok(issueTypes.includes("source_missing_ref"));
  assert.ok(issueTypes.includes("source_missing_capture_time"));
  assert.ok(issueTypes.includes("stale_low_confidence_note"));
  assert.ok(issueTypes.includes("topic_missing_structure"));
  assert.ok(issueTypes.includes("missing_page"));
  assert.deepEqual(health.json.missing_pages, [
    {
      target: "Missing Health Target",
      referenced_from: ["wiki/concepts/missing-link.md"]
    }
  ]);

  const report = await readJson(path.join(vault, health.json.report_path));
  const summary = await readFile(path.join(vault, health.json.summary_path));
  assert.equal(report.kind, "health-check");
  assert.match(summary, /## Missing Pages/);
});

test("commit stages intended files, writes change log, and creates a local git commit", async () => {
  const vault = await tempDir("dps-wiki-llm-git-vault-");
  await runCommand("git", ["init"], { cwd: vault });
  await runCommand("git", ["config", "user.name", "Test User"], { cwd: vault });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: vault });

  await writeFile(
    path.join(vault, "wiki/concepts/commit-test.md"),
    conceptNote("Commit Test", "## Summary\nA note to commit.")
  );

  const inputPath = path.join(vault, "commit-input.json");
  await writeJson(inputPath, {
    operation: "feedback",
    summary: "Commit test note",
    source_refs: ["raw/inbox/source.md"],
    affected_notes: ["wiki/concepts/commit-test.md"],
    paths_to_stage: [],
    feedback_record_ref: null,
    mutation_result_ref: null,
    commit_message: "feedback: Commit test note"
  });

  const result = await runTool("commit", ["--vault", vault, "--input", inputPath]);
  assert.equal(result.json.operation, "feedback");
  assert.equal(result.json.commit_created, true);
  assert.match(result.json.commit_sha, /^[0-9a-f]+$/);
  assert.ok(result.json.change_log_path.startsWith("state/change-log/"));
  assert.ok(result.json.staged_paths.includes("wiki/concepts/commit-test.md"));

  const log = await readFile(path.join(vault, result.json.change_log_path));
  assert.match(log, /operation: "feedback"/);
  assert.match(log, /# Commit test note/);

  const status = await runCommand("git", ["status", "--short"], { cwd: vault });
  assert.equal(status.stdout, "?? commit-input.json\n");
});

test("commit returns commit_created false when there are no material paths", async () => {
  const vault = await tempDir("dps-wiki-llm-empty-git-vault-");
  await runCommand("git", ["init"], { cwd: vault });
  await runCommand("git", ["config", "user.name", "Test User"], { cwd: vault });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: vault });

  const inputPath = path.join(vault, "commit-input.json");
  await writeJson(inputPath, {
    operation: "manual",
    summary: "Nothing to commit",
    source_refs: [],
    affected_notes: [],
    paths_to_stage: []
  });

  const result = await runTool("commit", ["--vault", vault, "--input", inputPath]);
  assert.deepEqual(result.json, {
    operation: "manual",
    commit_created: false,
    commit_sha: null,
    change_log_path: null,
    staged_paths: []
  });
});
