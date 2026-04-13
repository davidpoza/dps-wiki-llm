import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseArgs, readJsonInput } from "../dist/tools/lib/cli.js";
import { chatCompletionsUrl } from "../dist/tools/lib/llm.js";
import {
  loadJsonFile,
  pathExists,
  readTextIfExists,
  relativeVaultPath,
  resolveVaultRoot,
  resolveWithinRoot,
  toPosixPath,
  writeJsonFile,
  writeTextFile
} from "../dist/tools/lib/fs-utils.js";
import { mergeFrontmatter, splitFrontmatter, stringifyFrontmatter } from "../dist/tools/lib/frontmatter.js";
import { parseSections, renderMarkdown } from "../dist/tools/lib/markdown.js";
import {
  analyzeWikiGraph,
  extractTitle,
  extractUpdatedAt,
  extractWikiLinks,
  inferDocType,
  loadWikiDocs
} from "../dist/tools/lib/wiki-inspect.js";
import { conceptNote, sourceNote, tempDir, writeFile, writeJson } from "./helpers.js";

test("parseArgs handles shared flags and positional input", () => {
  assert.deepEqual(
    parseArgs(["--vault", "/vault", "--input", "plan.json", "--db", "state/custom.db", "--limit", "4", "--no-write", "--compact"]),
    {
      _: [],
      vault: "/vault",
      input: "plan.json",
      db: "state/custom.db",
      limit: 4,
      write: false,
      pretty: false
    }
  );

  assert.equal(parseArgs(["query text"]).input, "query text");
  assert.throws(() => parseArgs(["--unknown"]), /Unknown option/);
});

test("readJsonInput reads JSON files", async () => {
  const root = await tempDir();
  const inputPath = path.join(root, "input.json");
  await writeJson(inputPath, { ok: true });

  assert.deepEqual(await readJsonInput(inputPath), { ok: true });
});

test("chatCompletionsUrl normalizes OpenAI-compatible base URL variants", () => {
  const original = {
    LLM_CHAT_COMPLETIONS_URL: process.env.LLM_CHAT_COMPLETIONS_URL,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL
  };

  try {
    delete process.env.LLM_CHAT_COMPLETIONS_URL;
    delete process.env.LLM_BASE_URL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENROUTER_BASE_URL;
    assert.equal(chatCompletionsUrl(), "https://openrouter.ai/api/v1/chat/completions");

    process.env.OPENROUTER_BASE_URL = "https://openrouter.ai";
    assert.equal(chatCompletionsUrl(), "https://openrouter.ai/api/v1/chat/completions");

    process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
    assert.equal(chatCompletionsUrl(), "https://openrouter.ai/api/v1/chat/completions");

    delete process.env.OPENROUTER_BASE_URL;
    process.env.LLM_BASE_URL = "https://llm.example.test/v1";
    assert.equal(chatCompletionsUrl(), "https://llm.example.test/v1/chat/completions");

    process.env.LLM_CHAT_COMPLETIONS_URL = "https://llm.example.test/custom/chat/completions";
    assert.equal(chatCompletionsUrl(), "https://llm.example.test/custom/chat/completions");
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("fs utilities constrain paths and preserve JSON/text helpers", async () => {
  const root = await tempDir();
  const nested = resolveWithinRoot(root, "state/runtime/test.json");

  assert.equal(resolveVaultRoot(root), path.resolve(root));
  assert.equal(relativeVaultPath(root, nested), "state/runtime/test.json");
  assert.equal(toPosixPath(["state", "runtime", "test.json"].join(path.sep)), "state/runtime/test.json");
  assert.throws(() => resolveWithinRoot(root, "../outside.md"), /outside vault root/);

  assert.equal(await pathExists(nested), false);
  assert.equal(await readTextIfExists(nested), null);

  await writeTextFile(resolveWithinRoot(root, "notes/a.md"), "hello");
  assert.equal(await readTextIfExists(resolveWithinRoot(root, "notes/a.md")), "hello");

  await writeJsonFile(nested, { value: 1 });
  assert.deepEqual(await loadJsonFile(nested, {}), { value: 1 });
  assert.deepEqual(await loadJsonFile(resolveWithinRoot(root, "missing.json"), { fallback: true }), { fallback: true });
});

test("frontmatter parser, serializer, and merge handle nested data", () => {
  const parsed = splitFrontmatter(`---\ntype: concept\ntitle: "Example"\ncount: 2\nactive: true\ntags:\n  - llm\n  - wiki\nnested:\n  value: "x"\n---\n\n# Example\n`);

  assert.deepEqual(parsed.frontmatter, {
    type: "concept",
    title: "Example",
    count: 2,
    active: true,
    tags: ["llm", "wiki"],
    nested: { value: "x" }
  });
  assert.equal(parsed.body, "# Example\n");

  assert.equal(splitFrontmatter("# No frontmatter\n").body, "# No frontmatter\n");
  assert.throws(() => splitFrontmatter("---\ntitle: Broken\n# no end"), /Unterminated frontmatter/);
  assert.throws(() => splitFrontmatter("---\ntitle: Broken\n  bad: true\n---\n"), /Invalid frontmatter indentation/);

  assert.equal(
    stringifyFrontmatter({ type: "concept", tags: ["llm"], nested: { value: "x" } }),
    `---\ntype: "concept"\ntags:\n  - "llm"\nnested:\n  value: "x"\n---\n\n`
  );

  assert.deepEqual(mergeFrontmatter({ tags: ["a"], nested: { a: 1 } }, { tags: ["a", "b"], nested: { b: 2 } }), {
    tags: ["a", "b"],
    nested: { a: 1, b: 2 }
  });
});

test("markdown rendering merges frontmatter, sections, bullets, paragraphs, and related links", () => {
  const existing = `---\ntype: "concept"\ntitle: "Persistent Wiki"\ntags:\n  - "kb"\n---\n\n# Persistent Wiki\n\nIntro text.\n\n## Summary\nExisting summary.\n\n## Facts\n- Existing fact\n`;

  const rendered = renderMarkdown(
    "wiki/concepts/persistent-wiki.md",
    existing,
    {
      frontmatter: { tags: ["kb", "llm"] },
      sections: {
        Summary: ["Existing summary.", "New paragraph."],
        Facts: ["Existing fact", "New fact"],
        Interpretation: ["Plain interpretation."]
      },
      related_links: ["[[Knowledge Systems]]"],
      change_reason: "Test update"
    },
    { updatedDate: "2026-04-11", updatedBy: "test" }
  );

  assert.match(rendered, /updated: "2026-04-11"/);
  assert.match(rendered, /updated_by: "test"/);
  assert.match(rendered, /change_reason: "Test update"/);
  assert.match(rendered, /- "kb"\n  - "llm"/);
  assert.match(rendered, /Existing summary\.\n\nNew paragraph\./);
  assert.equal((rendered.match(/Existing fact/g) || []).length, 1);
  assert.match(rendered, /- New fact/);
  assert.match(rendered, /## Related\n- \[\[Knowledge Systems\]\]/);

  const created = renderMarkdown("wiki/concepts/new-note.md", null, {
    frontmatter: { type: "concept" },
    sections: { Summary: ["Created summary."] }
  });
  assert.match(created, /# New Note/);
});

test("parseSections extracts title, preamble, and second-level sections", () => {
  assert.deepEqual(parseSections("# Title\n\nPreamble\n\n## Summary\nBody\n\n## Facts\n- Fact\n"), {
    title: "Title",
    preamble: "Preamble",
    sections: [
      { name: "Summary", content: "Body" },
      { name: "Facts", content: "- Fact" }
    ]
  });
});

test("wiki inspection loads docs and analyzes resolved, broken, and ambiguous links", async () => {
  const vault = await tempDir();
  await writeFile(
    path.join(vault, "wiki/concepts/model-context-protocol.md"),
    conceptNote("Model Context Protocol", "## Summary\n[[Agent Tools]] and [[Missing Page]]")
  );
  await writeFile(path.join(vault, "wiki/concepts/agent-tools.md"), conceptNote("Agent Tools", "## Summary\nTool note."));
  await writeFile(path.join(vault, "wiki/topics/agent-tools.md"), conceptNote("Agent Tools", "## Summary\nDuplicate alias."));
  await writeFile(path.join(vault, "wiki/sources/source-a.md"), sourceNote("Source A", "## Summary\nSource note."));

  assert.equal(inferDocType("wiki/concepts/a.md", {}), "concept");
  assert.equal(inferDocType("wiki/other/a.md", {}), "unknown");
  assert.equal(extractTitle("wiki/concepts/file-name.md", {}, "# Markdown Title\n"), "Markdown Title");
  assert.equal(extractTitle("wiki/concepts/file-name.md", { title: "Frontmatter Title" }, ""), "Frontmatter Title");
  assert.equal(extractUpdatedAt({ updated_at: "2026-04-10" }, { mtime: new Date("2026-04-11T00:00:00Z") }), "2026-04-10");
  assert.deepEqual(extractWikiLinks("[[wiki/concepts/Agent Tools.md|tools]] [[Missing#Section]]"), [
    { raw: "wiki/concepts/Agent Tools.md|tools", normalized: "concepts/Agent Tools" },
    { raw: "Missing#Section", normalized: "Missing" }
  ]);

  const docs = await loadWikiDocs(vault);
  assert.equal(docs.length, 4);

  const graph = analyzeWikiGraph(docs);
  const sourcePath = "wiki/concepts/model-context-protocol.md";
  assert.deepEqual(graph.ambiguousTargets.get(sourcePath)?.[0].matches.sort(), [
    "wiki/concepts/agent-tools.md",
    "wiki/topics/agent-tools.md"
  ]);
  assert.deepEqual(graph.brokenLinks.get(sourcePath), [{ raw: "Missing Page", normalized: "Missing Page" }]);
});

test("loadWikiDocs tolerates a missing wiki directory", async () => {
  const vault = await tempDir();
  assert.deepEqual(await loadWikiDocs(vault), []);
  await fs.rm(vault, { recursive: true, force: true });
});
