import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  conceptNote,
  readFile,
  readJson,
  repoPath,
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

test("ingest workflow auto-applies non-empty LLM mutation plans with guardrails", async () => {
  const workflow = JSON.parse(await fs.readFile(repoPath("n8n/workflows/kb-ingest-raw-blueprint.json"), "utf8"));
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

  assert.ok(nodes.has("Should Apply LLM Plan?"));
  assert.ok(nodes.has("Build OpenRouter Source Note Request"));
  assert.ok(nodes.has("Call OpenRouter Source Note Cleaner"));
  assert.ok(nodes.has("Parse LLM Source Note"));
  assert.ok(nodes.has("Run LLM apply-update.ts"));
  assert.ok(nodes.has("Run LLM reindex.ts"));
  assert.ok(nodes.has("Run LLM commit.ts"));
  assert.match(nodes.get("Build OpenRouter Source Note Request").parameters.jsCode, /without losing materially useful information/);
  assert.match(nodes.get("Build OpenRouter Source Note Request").parameters.jsCode, /Do not invent facts/);
  assert.match(nodes.get("Parse LLM Source Note").parameters.jsCode, /LLM source note must include non-empty/);
  assert.match(nodes.get("Parse LLM Source Note").parameters.jsCode, /payload_b64/);
  assert.match(nodes.get("Build OpenRouter Ingest Plan Request").parameters.jsCode, /Never write directly under wiki/);
  assert.match(nodes.get("Build OpenRouter Ingest Plan Request").parameters.jsCode, /allowed_page_path_prefixes/);
  assert.match(nodes.get("Build OpenRouter Ingest Plan Request").parameters.jsCode, /source_note_update_allowed_path/);
  assert.match(nodes.get("Build OpenRouter Ingest Plan Request").parameters.jsCode, /Linked Notes/);
  assert.match(nodes.get("Build OpenRouter Ingest Plan Request").parameters.jsCode, /Sources/);
  assert.match(nodes.get("Build OpenRouter Ingest Plan Request").parameters.jsCode, /Parse Source Note Plan/);
  assert.match(nodes.get("Parse LLM Ingest Plan").parameters.jsCode, /guardrailRejections/);
  assert.match(nodes.get("Parse LLM Ingest Plan").parameters.jsCode, /idempotency_key/);
  assert.match(nodes.get("Parse LLM Ingest Plan").parameters.jsCode, /baselineSourceNotePath/);
  assert.match(nodes.get("Parse LLM Ingest Plan").parameters.jsCode, /hasOnlyLinkedNotesSection/);
  assert.match(nodes.get("Parse LLM Ingest Plan").parameters.jsCode, /source note updates may only write Linked Notes/);
  assert.match(nodes.get("Parse LLM Ingest Plan").parameters.jsCode, /page path outside allowed wiki areas/);
  assert.match(nodes.get("Build Ingest Response").parameters.jsCode, /openrouter_source_note_meta/);
  assert.match(nodes.get("Build Ingest Response").parameters.jsCode, /baseline_ingest_applied_llm_plan_applied/);
  assert.match(nodes.get("Build Ingest Response").parameters.jsCode, /llm_guardrail_rejections/);

  assert.equal(workflow.connections["Parse Source Payload"].main[0][0].node, "Build OpenRouter Source Note Request");
  assert.equal(workflow.connections["Build OpenRouter Source Note Request"].main[0][0].node, "Call OpenRouter Source Note Cleaner");
  assert.equal(workflow.connections["Call OpenRouter Source Note Cleaner"].main[0][0].node, "Parse LLM Source Note");
  assert.equal(workflow.connections["Parse LLM Source Note"].main[0][0].node, "Run plan-source-note.ts");
  assert.equal(workflow.connections["Parse LLM Ingest Plan"].main[0][0].node, "Should Apply LLM Plan?");
  assert.equal(workflow.connections["Should Apply LLM Plan?"].main[0][0].node, "Prepare LLM Plan Application");
  assert.equal(workflow.connections["Should Apply LLM Plan?"].main[1][0].node, "Build Ingest Response");
  assert.equal(workflow.connections["Parse LLM Commit Result"].main[0][0].node, "Build Ingest Response");

  const parseLlmPlan = (plan) => {
    const $input = {
      first: () => ({
        json: {
          choices: [
            {
              message: {
                content: JSON.stringify(plan)
              }
            }
          ]
        }
      })
    };
    const $node = {
      "Build OpenRouter Ingest Plan Request": {
        json: {
          baseline_mutation_plan: {
            page_actions: [{ path: "wiki/sources/source-a.md" }]
          }
        }
      }
    };

    return new Function("$input", "$node", nodes.get("Parse LLM Ingest Plan").parameters.jsCode)($input, $node)[0].json;
  };
  const guarded = parseLlmPlan({
    plan_id: "plan-guardrail-test",
    source_refs: ["raw/inbox/source-a.md", "wiki/sources/source-a.md"],
    page_actions: [
      {
        path: "wiki/sources/source-a.md",
        action: "update",
        idempotency_key: "src-a:linked-notes",
        payload: { sections: { "Linked Notes": ["[[Model Context Protocol]]"] } }
      },
      {
        path: "wiki/sources/other-source.md",
        action: "update",
        idempotency_key: "src-a:other",
        payload: { sections: { "Linked Notes": ["[[Other]]"] } }
      },
      {
        path: "wiki/sources/source-a.md",
        action: "update",
        idempotency_key: "src-a:summary",
        payload: { sections: { Summary: ["Do not rewrite source summary."] } }
      }
    ],
    index_updates: []
  });
  assert.equal(guarded.llm_mutation_plan.page_actions[0].action, "update");
  assert.equal(guarded.llm_mutation_plan.page_actions[1].action, "noop");
  assert.equal(guarded.llm_mutation_plan.page_actions[2].action, "noop");
  assert.deepEqual(
    guarded.llm_guardrail_rejections.map((item) => item.reason),
    ["page path outside allowed wiki areas", "source note updates may only write Linked Notes"]
  );
});

test("ingest-source and plan-source-note produce canonical ingestion contracts", async () => {
  const vault = await tempDir("dps-wiki-llm-ingest-vault-");
  await writeFile(
    path.join(vault, "raw/web/2026-04-10-example-source.md"),
    `---\ntitle: "Example Source"\ncanonical_url: "https://example.com/article"\nauthor: "Example Author"\ntags:\n  - llm\n  - wiki\n---\n\n# Ignored Heading\n\nThis source explains a persistent wiki workflow.\n`
  );
  const sourceInputPath = path.join(vault, "source-input.json");
  await writeJson(sourceInputPath, {
    raw_path: "raw/web/2026-04-10-example-source.md",
    captured_at: "2026-04-10T20:15:00Z"
  });

  const source = await runTool("ingest-source", ["--vault", vault, "--input", sourceInputPath]);

  assert.equal(source.json.source_kind, "web");
  assert.equal(source.json.raw_path, "raw/web/2026-04-10-example-source.md");
  assert.equal(source.json.title, "Example Source");
  assert.equal(source.json.canonical_url, "https://example.com/article");
  assert.equal(source.json.author, "Example Author");
  assert.equal(source.json.language, "unknown");
  assert.match(source.json.checksum, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(source.json.metadata.tags, ["llm", "wiki"]);

  const planInputPath = path.join(vault, "source-payload.json");
  await writeJson(planInputPath, source.json);

  const plan = await runTool("plan-source-note", ["--vault", vault, "--input", planInputPath]);

  assert.equal(plan.json.source_payload.source_id, source.json.source_id);
  assert.equal(plan.json.mutation_plan.operation, "ingest");
  assert.equal(plan.json.mutation_plan.page_actions[0].path, "wiki/sources/2026-04-10-example-source.md");
  assert.equal(plan.json.mutation_plan.page_actions[0].idempotency_key, source.json.source_id);
  assert.deepEqual(plan.json.mutation_plan.index_updates[0].entries_to_add, ["[[Example Source]]"]);
  assert.equal(plan.json.commit_input.operation, "ingest");
  assert.ok(plan.json.commit_input.paths_to_stage.includes("state/kb.db"));
});

test("plan-source-note uses an LLM-cleaned source_note when present", async () => {
  const vault = await tempDir("dps-wiki-llm-source-note-vault-");
  const planInputPath = path.join(vault, "source-payload.json");

  await writeJson(planInputPath, {
    source_id: "src-2026-04-10-web-cleaned",
    source_kind: "web",
    captured_at: "2026-04-10T20:15:00Z",
    raw_path: "raw/web/cleaned.md",
    title: "Cleaned Source",
    content: "Noisy original content that should not be used for the source note.",
    source_note: {
      summary: "LLM-cleaned summary.",
      raw_context: "LLM-cleaned raw context with preserved details.",
      extracted_claims: ["Grounded claim one.", "Grounded claim two."],
      open_questions: ["What remains unresolved?"],
      generated_by: "openrouter",
      model: "test/model"
    }
  });

  const plan = await runTool("plan-source-note", ["--vault", vault, "--input", planInputPath]);
  const sourceAction = plan.json.mutation_plan.page_actions[0];

  assert.deepEqual(sourceAction.payload.sections.Summary, ["LLM-cleaned summary."]);
  assert.deepEqual(sourceAction.payload.sections["Raw Context"], ["LLM-cleaned raw context with preserved details."]);
  assert.deepEqual(sourceAction.payload.sections["Extracted Claims"], ["Grounded claim one.", "Grounded claim two."]);
  assert.deepEqual(sourceAction.payload.sections["Open Questions"], ["What remains unresolved?"]);
  assert.equal(sourceAction.payload.frontmatter.source_note_generated_by, "openrouter");
  assert.equal(sourceAction.payload.frontmatter.source_note_model, "test/model");
});

test("answer-context reads wiki docs and answer-record persists the output artifact", async () => {
  const vault = await createVault();
  const contextInputPath = path.join(vault, "answer-context-input.json");
  await writeJson(contextInputPath, {
    question: "What does MCP connect?",
    retrieval: {
      query: "protocol",
      limit: 1,
      results: [
        {
          path: "wiki/concepts/model-context-protocol.md",
          title: "Model Context Protocol",
          doc_type: "concept",
          score: 1.2
        }
      ]
    }
  });

  const context = await runTool("answer-context", ["--vault", vault, "--input", contextInputPath]);

  assert.equal(context.json.question, "What does MCP connect?");
  assert.equal(context.json.context_docs[0].path, "wiki/concepts/model-context-protocol.md");
  assert.match(context.json.context_docs[0].body, /MCP connects tools and context/);
  assert.equal(context.json.answer_record.should_review_for_feedback, true);
  assert.deepEqual(context.json.answer_record.evidence_used, ["wiki/concepts/model-context-protocol.md"]);

  const answerInputPath = path.join(vault, "answer-record-input.json");
  await writeJson(answerInputPath, {
    answer_record: context.json.answer_record,
    answer: "MCP connects tools and context."
  });

  const answer = await runTool("answer-record", ["--vault", vault, "--input", answerInputPath]);

  assert.equal(answer.json.record.output_id, context.json.answer_record.output_id);
  assert.equal(answer.json.wrote, true);
  assert.ok(answer.json.output_path.startsWith("outputs/"));

  const artifact = await readFile(path.join(vault, answer.json.output_path));
  assert.match(artifact, /# Answer: What does MCP connect\?/);
  assert.match(artifact, /MCP connects tools and context\./);
  assert.match(artifact, /- wiki\/concepts\/model-context-protocol\.md/);
});

test("new JSON-driven entrypoints reject unsafe paths", async () => {
  const vault = await createVault();
  const ingestInputPath = path.join(vault, "unsafe-ingest.json");
  await writeJson(ingestInputPath, { raw_path: "raw/../wiki/concepts/model-context-protocol.md" });

  await assert.rejects(
    runTool("ingest-source", ["--vault", vault, "--input", ingestInputPath]),
    /rejects path traversal/
  );

  const answerContextInputPath = path.join(vault, "unsafe-answer-context.json");
  await writeJson(answerContextInputPath, {
    question: "Unsafe?",
    retrieval: {
      query: "unsafe",
      limit: 1,
      results: [{ path: "wiki/../raw/inbox/source.md", title: "Unsafe", doc_type: "source", score: 0 }]
    }
  });

  await assert.rejects(
    runTool("answer-context", ["--vault", vault, "--input", answerContextInputPath]),
    /rejects path traversal/
  );

  const answerRecordInputPath = path.join(vault, "unsafe-answer-record.json");
  await writeJson(answerRecordInputPath, {
    question: "Unsafe?",
    answer: "No.",
    output_path: "outputs/../wiki/escape.md"
  });

  await assert.rejects(
    runTool("answer-record", ["--vault", vault, "--input", answerRecordInputPath]),
    /must stay under outputs/
  );
});

test("n8n workflow files remain valid JSON", async () => {
  const workflowDir = repoPath("n8n", "workflows");
  const files = (await fs.readdir(workflowDir)).filter((file) => file.endsWith(".json"));

  assert.ok(files.length > 0);

  const workflows = new Map();

  for (const file of files) {
    const workflow = JSON.parse(await readFile(path.join(workflowDir, file)));
    workflows.set(file, workflow);
    assert.equal(typeof workflow.name, "string");
    assert.ok(Array.isArray(workflow.nodes));
    assert.ok(workflow.connections && typeof workflow.connections === "object");

    for (const node of workflow.nodes) {
      if (node.type === "n8n-nodes-base.code") {
        assert.doesNotThrow(() => new Function(node.parameters.jsCode), `${file} :: ${node.name}`);
      }
    }
  }

  const answer = workflows.get("kb-answer-blueprint.json");
  assert.equal(answer.name, "KB - Answer OpenRouter Manual");
  assert.ok(answer.nodes.some((node) => node.name === "Call OpenRouter Answer"));
  assert.ok(answer.nodes.some((node) => node.name === "Call OpenRouter Feedback"));
  assert.ok(answer.nodes.some((node) => node.name === "Validate feedback-record.ts"));
  assert.match(
    answer.nodes.find((node) => node.name === "Build OpenRouter Answer Request").parameters.jsCode,
    /OPENROUTER_MODEL/
  );

  const ingest = workflows.get("kb-ingest-raw-blueprint.json");
  assert.equal(ingest.name, "KB - Ingest Raw OpenRouter Manual");
  assert.ok(ingest.nodes.some((node) => node.name === "Call OpenRouter Ingest Planner"));
  assert.match(
    ingest.nodes.find((node) => node.name === "Build Ingest Response").parameters.jsCode,
    /llm_plan_approval_required/
  );

  const feedback = workflows.get("kb-apply-feedback.json");
  assert.match(
    feedback.nodes.find((node) => node.name === "Prepare Feedback Payload").parameters.jsCode,
    /approved=true/
  );
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
        path: "wiki/sources/source-a.md",
        action: "update",
        doc_type: "source",
        change_type: "new_link",
        idempotency_key: "src-new-source:source-linked-notes",
        payload: {
          sections: {
            "Linked Notes": ["[[Model Context Protocol]]"]
          }
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
  assert.ok(first.json.updated.includes("wiki/sources/source-a.md"));
  assert.ok(first.json.updated.includes("INDEX.md"));
  assert.ok(first.json.skipped.includes("wiki/concepts/noop.md"));

  const source = await readFile(path.join(vault, "wiki/sources/new-source.md"));
  assert.match(source, /# New Source/);
  assert.match(source, /updated_by: "apply-update.ts"/);
  const linkedSource = await readFile(path.join(vault, "wiki/sources/source-a.md"));
  assert.match(linkedSource, /## Linked Notes\n- \[\[Model Context Protocol\]\]/);

  const ledger = await readJson(path.join(vault, "state/runtime/idempotency-keys.json"));
  assert.equal(ledger["src-new-source"].path, "wiki/sources/new-source.md");

  const second = await runTool("apply-update", ["--vault", vault, "--input", planPath]);
  assert.ok(second.json.idempotent_hits.includes("src-new-source"));
  assert.ok(second.json.idempotent_hits.includes("src-new-source:concept"));
  assert.ok(second.json.idempotent_hits.includes("src-new-source:source-linked-notes"));
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

test("commit accepts git identity from environment variables", async () => {
  const vault = await tempDir("dps-wiki-llm-env-git-vault-");
  await runCommand("git", ["init"], { cwd: vault });

  await writeFile(
    path.join(vault, "wiki/concepts/env-commit-test.md"),
    conceptNote("Env Commit Test", "## Summary\nA note to commit with environment identity.")
  );

  const inputPath = path.join(vault, "commit-input.json");
  await writeJson(inputPath, {
    operation: "ingest",
    summary: "Commit with environment identity",
    source_refs: ["raw/inbox/source.md"],
    affected_notes: ["wiki/concepts/env-commit-test.md"],
    paths_to_stage: []
  });

  const env = {
    GIT_CONFIG_GLOBAL: path.join(vault, "missing-global-gitconfig"),
    GIT_AUTHOR_NAME: "Env User",
    GIT_AUTHOR_EMAIL: "env@example.com",
    GIT_COMMITTER_NAME: "Env User",
    GIT_COMMITTER_EMAIL: "env@example.com"
  };
  const result = await runTool("commit", ["--vault", vault, "--input", inputPath], { env });

  assert.equal(result.json.operation, "ingest");
  assert.equal(result.json.commit_created, true);

  const log = await runCommand("git", ["log", "-1", "--format=%an <%ae>|%cn <%ce>"], { cwd: vault, env });
  assert.equal(log.stdout.trim(), "Env User <env@example.com>|Env User <env@example.com>");
});

test("commit returns commit_created false when there are no material paths", async () => {
  const vault = await tempDir("dps-wiki-llm-empty-git-vault-");
  await runCommand("git", ["init"], { cwd: vault });

  const inputPath = path.join(vault, "commit-input.json");
  await writeJson(inputPath, {
    operation: "manual",
    summary: "Nothing to commit",
    source_refs: [],
    affected_notes: [],
    paths_to_stage: []
  });

  const result = await runTool("commit", ["--vault", vault, "--input", inputPath], {
    env: {
      GIT_CONFIG_GLOBAL: path.join(vault, "missing-global-gitconfig")
    }
  });
  assert.deepEqual(result.json, {
    operation: "manual",
    commit_created: false,
    commit_sha: null,
    change_log_path: null,
    staged_paths: []
  });
});
