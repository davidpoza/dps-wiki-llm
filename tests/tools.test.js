import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
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
  await writeFile(
    path.join(vault, "wiki/sources/productivity-guide.md"),
    sourceNote(
      "The Productivity Guide: Time Management Strategies That Work",
      `## Summary\nA source about productivity and time management strategies.\n\n## Raw Context\nThe productivity guide covers practical time management strategies that work.\n\n## Extracted Claims\n- Productivity improves when time management strategies are explicit.`,
      "raw/web/productivity-guide.md"
    )
  );

  return vault;
}

function fakeYtDlpBinaryArgs() {
  const code = `
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(1);
const info = JSON.parse(process.env.FAKE_YTDLP_INFO_JSON || "{}");

if (args.includes("--dump-json")) {
  process.stdout.write(JSON.stringify(info) + "\\n");
  process.exit(0);
}

const pathsIndex = args.indexOf("--paths");
const langIndex = args.indexOf("--sub-langs");
const outputDir = pathsIndex >= 0 ? args[pathsIndex + 1] : process.cwd();
const language = langIndex >= 0 ? args[langIndex + 1] : "en";
const failLanguages = (process.env.FAKE_YTDLP_FAIL_LANGUAGES || "").split(",").map((entry) => entry.trim()).filter(Boolean);
if (failLanguages.includes(language)) {
  process.stderr.write("ERROR: Unable to download video subtitles for '" + language + "': HTTP Error 429: Too Many Requests\\n");
  process.exit(1);
}
const extension = process.env.FAKE_YTDLP_SUBTITLE_EXT || "vtt";
const subtitle = process.env.FAKE_YTDLP_SUBTITLE || "WEBVTT\\n\\n00:00:00.000 --> 00:00:01.000\\nFallback caption.\\n";
const id = info.id || "fake-video";

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, id + "." + language + "." + extension), subtitle, "utf8");
`;

  return ["--eval", code, "--"];
}

async function startMockOpenRouter(responses) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) {
      body += chunk;
    }

    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: body ? JSON.parse(body) : null
    });

    const next = responses.shift() || {
      status: 500,
      body: { error: { message: "unexpected mock OpenRouter request" } }
    };
    response.writeHead(next.status || 200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(next.body));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

test("init-db, reindex, and search work together", async () => {
  const vault = await createVault();

  const init = await runTool("init-db", ["--vault", vault]);
  assert.deepEqual(init.json, { db_path: "state/kb.db", initialized: true });

  const reindex = await runTool("reindex", ["--vault", vault]);
  assert.equal(reindex.json.db_path, "state/kb.db");
  assert.equal(reindex.json.indexed, 4);
  assert.equal(reindex.json.fts_rebuilt, true);

  const search = await runTool("search", ["--vault", vault, "--limit", "5", "protocol"]);
  assert.equal(search.json.query, "protocol");
  assert.equal(search.json.limit, 5);
  assert.ok(search.json.results.some((item) => item.path === "wiki/concepts/model-context-protocol.md"));

  const naturalSearch = await runTool("search", ["--vault", vault, "--limit", "5", "what should I know about model context"]);
  assert.match(naturalSearch.json.fts_query, / OR /);
  assert.ok(naturalSearch.json.results.some((item) => item.path === "wiki/concepts/model-context-protocol.md"));

  const spanishSearch = await runTool("search", [
    "--vault",
    vault,
    "--limit",
    "5",
    "dame los mejores tips sobre productividad"
  ]);
  assert.match(spanishSearch.json.fts_query, /productivity/);
  assert.ok(spanishSearch.json.results.some((item) => item.path === "wiki/sources/productivity-guide.md"));
});

test("bot-lock serializes bot tasks with a vault filesystem lock", async () => {
  const vault = await tempDir("dps-wiki-llm-lock-vault-");

  const first = await runTool("bot-lock", [
    "acquire",
    "--vault",
    vault,
    "--name",
    "telegram-test",
    "--owner",
    "test-run-1",
    "--ttl-ms",
    "60000"
  ]);
  assert.equal(first.json.status, "acquired");
  assert.equal(first.json.acquired, true);
  assert.match(first.json.lock_id, /^telegram-test-/);
  assert.equal(first.json.lock_path, "state/locks/telegram-test.lock");

  const second = await runTool("bot-lock", [
    "acquire",
    "--vault",
    vault,
    "--name",
    "telegram-test",
    "--owner",
    "test-run-2",
    "--ttl-ms",
    "60000"
  ]);
  assert.equal(second.json.status, "locked");
  assert.equal(second.json.acquired, false);
  assert.equal(second.json.lock_id, first.json.lock_id);

  const wrongRelease = await runTool("bot-lock", [
    "release",
    "--vault",
    vault,
    "--name",
    "telegram-test",
    "--lock-id",
    "wrong-lock-id"
  ]);
  assert.equal(wrongRelease.json.status, "not_owner");
  assert.equal(wrongRelease.json.released, false);

  const release = await runTool("bot-lock", [
    "release",
    "--vault",
    vault,
    "--name",
    "telegram-test",
    "--lock-id",
    first.json.lock_id
  ]);
  assert.equal(release.json.status, "released");
  assert.equal(release.json.released, true);

  const reacquired = await runTool("bot-lock", [
    "acquire",
    "--vault",
    vault,
    "--name",
    "telegram-test",
    "--owner",
    "test-run-3",
    "--ttl-ms",
    "60000"
  ]);
  assert.equal(reacquired.json.status, "acquired");
  assert.equal(reacquired.json.acquired, true);
  assert.notEqual(reacquired.json.lock_id, first.json.lock_id);
});

test("ingest workflow delegates the full ingest pipeline to ingest-run", async () => {
  const workflow = JSON.parse(await fs.readFile(repoPath("n8n/workflows/kb-ingest-raw-blueprint.json"), "utf8"));
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

  assert.equal(workflow.nodes.length, 8);
  assert.ok(nodes.has("Build Ingest Run Payload"));
  assert.ok(nodes.has("Run ingest-run.ts"));
  assert.ok(nodes.has("Parse Ingest Run Result"));
  assert.ok(nodes.has("Should Send Telegram Ingest Log?"));
  assert.ok(nodes.has("Send Telegram Ingest Log"));
  assert.ok(!workflow.nodes.some((node) => node.name.includes("OpenRouter")));
  assert.match(nodes.get("Run ingest-run.ts").parameters.command, /ingest-run.js/);
  assert.match(nodes.get("Build Ingest Run Payload").parameters.jsCode, /payload_b64/);
  assert.match(nodes.get("Finalize Ingest Response").parameters.jsCode, /telegram_last_update_id/);

  assert.equal(workflow.connections["Local File Trigger"].main[0][0].node, "Build Ingest Run Payload");
  assert.equal(workflow.connections["Manual Trigger"].main[0][0].node, "Build Ingest Run Payload");
  assert.equal(workflow.connections["Build Ingest Run Payload"].main[0][0].node, "Run ingest-run.ts");
  assert.equal(workflow.connections["Run ingest-run.ts"].main[0][0].node, "Parse Ingest Run Result");
  assert.equal(workflow.connections["Parse Ingest Run Result"].main[0][0].node, "Should Send Telegram Ingest Log?");
  assert.equal(workflow.connections["Should Send Telegram Ingest Log?"].main[0][0].node, "Send Telegram Ingest Log");
  assert.equal(workflow.connections["Should Send Telegram Ingest Log?"].main[1][0].node, "Finalize Ingest Response");
});

test("telegram bot workflow delegates answer and ingest work to macro scripts", async () => {
  const workflow = JSON.parse(await fs.readFile(repoPath("n8n/workflows/kb-answer-blueprint.json"), "utf8"));
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

  assert.equal(workflow.nodes.length, 23);
  assert.ok(!nodes.has("Webhook"));
  assert.ok(nodes.has("Schedule Trigger"));
  assert.ok(nodes.has("Call Telegram getUpdates"));
  assert.ok(nodes.has("Acquire Bot Lock"));
  assert.ok(nodes.has("Parse Bot Lock Result"));
  assert.ok(nodes.has("Is Telegram Ingest Command?"));
  assert.ok(nodes.has("Run answer-run.ts"));
  assert.ok(nodes.has("Run ingest-run.ts"));
  assert.ok(nodes.has("Send Telegram Answer Log"));
  assert.ok(nodes.has("Send Telegram Ingest Log"));
  assert.ok(nodes.has("Release Bot Lock After Answer"));
  assert.ok(nodes.has("Release Bot Lock After Ingest"));
  assert.ok(!workflow.nodes.some((node) => node.name.includes("OpenRouter")));
  assert.ok(!workflow.nodes.some((node) => node.name === "Run youtube-transcript.ts"));
  assert.match(nodes.get("Run answer-run.ts").parameters.command, /answer-run.js/);
  assert.match(nodes.get("Run ingest-run.ts").parameters.command, /ingest-run.js/);
  assert.match(nodes.get("Acquire Bot Lock").parameters.command, /bot-lock.js acquire/);
  assert.match(nodes.get("Release Bot Lock After Answer").parameters.command, /bot-lock.js release/);
  assert.match(nodes.get("Build Telegram Poll Request").parameters.jsCode, /getWorkflowStaticData/);
  assert.match(nodes.get("Prepare Telegram Updates").parameters.jsCode, /telegram_last_update_id/);

  const staticData = {};
  const polled = new Function(
    "$input",
    "$env",
    "$getWorkflowStaticData",
    nodes.get("Prepare Telegram Updates").parameters.jsCode
  )(
    {
      first: () => ({
        json: {
          ok: true,
          result: [
            {
              update_id: 123,
              message: {
                message_id: 456,
                chat: { id: 789 },
                text: "/ask What does MCP connect?"
              }
            }
          ]
        }
      })
    },
    { TELEGRAM_CHAT_ID: "789" },
    () => staticData
  )[0].json;
  assert.equal(polled.body.update_id, 123);
  assert.equal(polled.telegram_command, "ask");
  assert.equal(staticData.telegram_last_update_id, undefined);

  const locked = new Function("$input", "$node", nodes.get("Parse Bot Lock Result").parameters.jsCode)(
    {
      first: () => ({
        json: {
          stdout: JSON.stringify({ status: "locked", acquired: false, lock_id: "existing-lock" })
        }
      })
    },
    { "Prepare Telegram Updates": { json: polled } }
  );
  assert.deepEqual(locked, []);

  const lockId = "telegram-bot-lock-123";
  const lockedPolled = new Function("$input", "$node", nodes.get("Parse Bot Lock Result").parameters.jsCode)(
    {
      first: () => ({ json: { stdout: JSON.stringify({ status: "acquired", acquired: true, lock_id: lockId }) } })
    },
    { "Prepare Telegram Updates": { json: polled } }
  )[0].json;
  assert.equal(lockedPolled.telegram_lock_acquired, true);
  assert.equal(lockedPolled.telegram_lock_id, lockId);

  const answerPayload = new Function("$input", nodes.get("Build Answer Run Payload").parameters.jsCode)({
    first: () => ({ json: lockedPolled })
  })[0].json;
  assert.ok(answerPayload.payload_b64);

  const finalized = new Function("$json", "$node", "$getWorkflowStaticData", nodes.get("Finalize Answer Response").parameters.jsCode)(
    {},
    { "Parse Answer Run Result": { json: { telegram_polled: true, telegram_update_id: 123 } } },
    () => staticData
  )[0].json;
  assert.equal(finalized.telegram_update_id, 123);
  assert.equal(staticData.telegram_last_update_id, 123);

  assert.equal(workflow.connections["Is Telegram Ingest Command?"].main[0][0].node, "Build Ingest Run Payload");
  assert.equal(workflow.connections["Is Telegram Ingest Command?"].main[1][0].node, "Build Answer Run Payload");
  assert.equal(workflow.connections["Build Answer Run Payload"].main[0][0].node, "Run answer-run.ts");
  assert.equal(workflow.connections["Build Ingest Run Payload"].main[0][0].node, "Run ingest-run.ts");
  assert.equal(workflow.connections["Finalize Answer Response"].main[0][0].node, "Release Bot Lock After Answer");
  assert.equal(workflow.connections["Finalize Ingest Response"].main[0][0].node, "Release Bot Lock After Ingest");
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

test("youtube-transcript writes a raw YouTube transcript source", async () => {
  const vault = await tempDir("dps-wiki-llm-youtube-vault-");
  const fakeYtDlpArgs = fakeYtDlpBinaryArgs();
  const inputPath = path.join(vault, "youtube-input.json");
  await writeJson(inputPath, {
    url: "https://youtu.be/dQw4w9WgXcQ",
    captured_at: "2026-04-12T10:00:00Z",
    language_preferences: ["en", "es"]
  });

  const result = await runTool("youtube-transcript", ["--vault", vault, "--input", inputPath], {
    env: {
      YTDLP_BINARY: process.execPath,
      YTDLP_BINARY_ARGS: JSON.stringify(fakeYtDlpArgs),
      FAKE_YTDLP_INFO_JSON: JSON.stringify({
        id: "dQw4w9WgXcQ",
        title: "Example YouTube Talk",
        uploader: "Example Channel",
        webpage_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        subtitles: {
          en: [{ ext: "vtt", name: "English" }]
        },
        automatic_captions: {}
      }),
      FAKE_YTDLP_SUBTITLE: "WEBVTT\n\n00:00:00.000 --> 00:00:01.200\nFirst caption.\n\n00:00:01.200 --> 00:00:03.000\nSecond caption.\n"
    }
  });

  assert.equal(result.json.status, "created");
  assert.equal(result.json.video_id, "dQw4w9WgXcQ");
  assert.equal(result.json.segment_count, 2);
  assert.match(result.json.raw_path, /^raw\/web\/2026-04-12-youtube-example-youtube-talk-/);

  const raw = await readFile(path.join(vault, result.json.raw_path));
  assert.match(raw, /source: "youtube"/);
  assert.match(raw, /youtube_video_id: "dQw4w9WgXcQ"/);
  assert.match(raw, /\[00:00:00\] First caption\./);
  assert.match(raw, /\[00:00:01\] Second caption\./);
});

test("youtube-transcript tries the next subtitle track when yt-dlp download fails", async () => {
  const vault = await tempDir("dps-wiki-llm-youtube-fallback-vault-");
  const fakeYtDlpArgs = fakeYtDlpBinaryArgs();
  const inputPath = path.join(vault, "youtube-input.json");
  await writeJson(inputPath, {
    url: "https://www.youtube.com/watch?v=GOhMh__Z4xI",
    captured_at: "2026-04-12T10:30:00Z",
    language_preferences: ["en", "es"]
  });

  const result = await runTool("youtube-transcript", ["--vault", vault, "--input", inputPath], {
    env: {
      YTDLP_BINARY: process.execPath,
      YTDLP_BINARY_ARGS: JSON.stringify(fakeYtDlpArgs),
      FAKE_YTDLP_FAIL_LANGUAGES: "en",
      FAKE_YTDLP_INFO_JSON: JSON.stringify({
        id: "GOhMh__Z4xI",
        title: "Fallback Captions",
        subtitles: {
          en: [{ ext: "vtt", name: "English" }],
          es: [{ ext: "vtt", name: "Spanish" }]
        },
        automatic_captions: {}
      }),
      FAKE_YTDLP_SUBTITLE: "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nSpanish fallback line.\n"
    }
  });

  assert.equal(result.json.status, "created");
  assert.equal(result.json.caption_language, "es");
  assert.equal(result.json.caption_name, "Spanish");

  const raw = await readFile(path.join(vault, result.json.raw_path));
  assert.match(raw, /language: "es"/);
  assert.match(raw, /\[00:00:00\] Spanish fallback line\./);
});

test("youtube-transcript reports YouTube videos without subtitles", async () => {
  const vault = await tempDir("dps-wiki-llm-youtube-empty-vault-");
  const fakeYtDlpArgs = fakeYtDlpBinaryArgs();
  const inputPath = path.join(vault, "youtube-input.json");
  await writeJson(inputPath, {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  });

  const result = await runTool("youtube-transcript", ["--vault", vault, "--input", inputPath], {
    env: {
      YTDLP_BINARY: process.execPath,
      YTDLP_BINARY_ARGS: JSON.stringify(fakeYtDlpArgs),
      FAKE_YTDLP_INFO_JSON: JSON.stringify({
        id: "dQw4w9WgXcQ",
        title: "No Captions",
        subtitles: {},
        automatic_captions: {}
      })
    }
  });

  assert.equal(result.json.status, "failed");
  assert.equal(result.json.reason, "YouTube video has no captions or subtitles");
  assert.equal(result.json.video_id, "dQw4w9WgXcQ");
});

test("youtube-transcript falls back to autogenerated captions from yt-dlp", async () => {
  const vault = await tempDir("dps-wiki-llm-youtube-asr-vault-");
  const fakeYtDlpArgs = fakeYtDlpBinaryArgs();
  const inputPath = path.join(vault, "youtube-input.json");
  await writeJson(inputPath, {
    url: "https://www.youtube.com/watch?v=GOhMh__Z4xI",
    captured_at: "2026-04-12T11:00:00Z",
    language_preferences: ["en"]
  });

  const result = await runTool("youtube-transcript", ["--vault", vault, "--input", inputPath], {
    env: {
      YTDLP_BINARY: process.execPath,
      YTDLP_BINARY_ARGS: JSON.stringify(fakeYtDlpArgs),
      FAKE_YTDLP_INFO_JSON: JSON.stringify({
        id: "GOhMh__Z4xI",
        title: "ASR Captions",
        subtitles: {},
        automatic_captions: {
          en: [{ ext: "vtt", name: "English (auto-generated)" }]
        }
      }),
      FAKE_YTDLP_SUBTITLE: "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nAuto generated line.\n"
    }
  });

  assert.equal(result.json.status, "created");
  assert.equal(result.json.caption_kind, "asr");
  assert.equal(result.json.segment_count, 1);

  const raw = await readFile(path.join(vault, result.json.raw_path));
  assert.match(raw, /caption_kind: "asr"/);
  assert.match(raw, /\[00:00:00\] Auto generated line\./);
});

test("youtube-transcript collapses overlapping YouTube ASR VTT captions", async () => {
  const vault = await tempDir("dps-wiki-llm-youtube-asr-overlap-vault-");
  const fakeYtDlpArgs = fakeYtDlpBinaryArgs();
  const inputPath = path.join(vault, "youtube-input.json");
  await writeJson(inputPath, {
    url: "https://www.youtube.com/watch?v=EWvNQjAaOHw",
    captured_at: "2026-04-12T11:30:00Z",
    language_preferences: ["en"]
  });

  const result = await runTool("youtube-transcript", ["--vault", vault, "--input", inputPath], {
    env: {
      YTDLP_BINARY: process.execPath,
      YTDLP_BINARY_ARGS: JSON.stringify(fakeYtDlpArgs),
      FAKE_YTDLP_INFO_JSON: JSON.stringify({
        id: "EWvNQjAaOHw",
        title: "Overlapping ASR Captions",
        subtitles: {},
        automatic_captions: {
          en: [{ ext: "vtt", name: "English" }]
        }
      }),
      FAKE_YTDLP_SUBTITLE:
        "WEBVTT\n\n" +
        "00:00:00.000 --> 00:00:02.000\nhi everyone so in this video I would\n\n" +
        "00:00:02.000 --> 00:00:02.500\nhi everyone so in this video I would\n\n" +
        "00:00:02.000 --> 00:00:03.000\nhi everyone so in this video I would like to continue our general audience\n\n" +
        "00:00:03.000 --> 00:00:07.000\nlike to continue our general audience\n\n" +
        "00:00:03.000 --> 00:00:07.500\nlike to continue our general audience series on large language models\n"
    }
  });

  assert.equal(result.json.status, "created");
  assert.equal(result.json.segment_count, 3);

  const raw = await readFile(path.join(vault, result.json.raw_path));
  assert.match(raw, /\[00:00:00\] hi everyone so in this video I would/);
  assert.match(raw, /\[00:00:02\] like to continue our general audience/);
  assert.match(raw, /\[00:00:03\] series on large language models/);
  assert.doesNotMatch(raw, /hi everyone so in this video I would\n\\[00:00:02\\] hi everyone so in this video I would/);
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

test("answer-run performs retrieval, LLM answer synthesis, answer recording, and feedback validation", async () => {
  const vault = await createVault();
  await runTool("init-db", ["--vault", vault]);
  await runTool("reindex", ["--vault", vault]);

  const mock = await startMockOpenRouter([
    {
      body: {
        id: "chat-answer",
        model: "mock/model",
        choices: [
          {
            message: { content: "MCP connects tools and context." },
            finish_reason: "stop"
          }
        ],
        usage: { total_tokens: 12 }
      }
    },
    {
      body: {
        id: "chat-feedback",
        model: "mock/model",
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "output_only",
                reason: "The answer is useful but does not need a wiki mutation.",
                source_refs: [],
                candidate_items: [],
                affected_notes: []
              })
            },
            finish_reason: "stop"
          }
        ],
        usage: { total_tokens: 8 }
      }
    }
  ]);

  try {
    const inputPath = path.join(vault, "answer-run-input.json");
    await writeJson(inputPath, {
      question: "What does MCP connect?",
      limit: 5
    });

    const result = await runTool("answer-run", ["--vault", vault, "--input", inputPath], {
      env: {
        OPENROUTER_API_KEY: "test-key",
        LLM_API_KEY_HEADER: "x-api-key",
        OPENROUTER_BASE_URL: mock.baseUrl,
        OPENROUTER_MODEL: "mock/model",
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_CHAT_ID: ""
      }
    });

    assert.equal(result.json.status, "answer_recorded_feedback_proposed");
    assert.equal(result.json.answer, "MCP connects tools and context.");
    assert.equal(result.json.proposed_feedback.decision, "output_only");
    assert.equal(result.json.openrouter_answer_meta.id, "chat-answer");
    assert.equal(result.json.openrouter_feedback_meta.id, "chat-feedback");
    assert.ok(result.json.retrieval.results.some((item) => item.path === "wiki/concepts/model-context-protocol.md"));
    assert.equal(result.json.telegram_enabled, false);
    assert.equal(mock.requests.length, 2);
    assert.ok(mock.requests.every((request) => request.headers["x-api-key"] === "test-key"));
    assert.ok(mock.requests.every((request) => !request.headers.authorization));

    const artifact = await readFile(path.join(vault, result.json.output_path));
    assert.match(artifact, /# Answer: What does MCP connect\?/);
    assert.match(artifact, /MCP connects tools and context\./);
  } finally {
    await mock.close();
  }
});

test("ingest-run applies the baseline ingest pipeline and skips empty LLM mutation plans", async () => {
  const vault = await tempDir("dps-wiki-llm-ingest-run-vault-");
  await runCommand("git", ["init"], { cwd: vault });
  await runCommand("git", ["config", "user.name", "Test User"], { cwd: vault });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: vault });
  await writeFile(path.join(vault, "INDEX.md"), "# Index\n\n## Entries\n");
  await writeFile(
    path.join(vault, "raw/web/compact-workflows.md"),
    `---\ntitle: "Compact Workflow Source"\ncanonical_url: "https://example.com/compact-workflows"\n---\n\nCompact workflows move fragile glue into scripts.\n`
  );

  const mock = await startMockOpenRouter([
    {
      body: {
        id: "chat-source-note",
        model: "mock/model",
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "A source about compact workflows.",
                raw_context: "The source says compact workflows move fragile glue into scripts.",
                extracted_claims: ["Compact workflows move fragile glue into scripts."],
                open_questions: []
              })
            },
            finish_reason: "stop"
          }
        ],
        usage: { total_tokens: 10 }
      }
    },
    {
      body: {
        id: "chat-ingest-plan",
        model: "mock/model",
        choices: [
          {
            message: {
              content: JSON.stringify({
                plan_id: "plan-compact-workflow-noop",
                operation: "ingest",
                summary: "No reusable changes beyond the source note.",
                source_refs: ["raw/web/compact-workflows.md", "wiki/sources/2026-04-13-compact-workflow-source.md"],
                page_actions: [],
                index_updates: [],
                post_actions: { reindex: true, commit: true }
              })
            },
            finish_reason: "stop"
          }
        ],
        usage: { total_tokens: 9 }
      }
    }
  ]);

  try {
    const inputPath = path.join(vault, "ingest-run-input.json");
    await writeJson(inputPath, {
      raw_path: "raw/web/compact-workflows.md",
      captured_at: "2026-04-13T10:00:00Z"
    });

    const result = await runTool("ingest-run", ["--vault", vault, "--input", inputPath], {
      env: {
        OPENROUTER_API_KEY: "test-key",
        LLM_API_KEY_HEADER: "x-api-key",
        OPENROUTER_BASE_URL: mock.baseUrl,
        OPENROUTER_MODEL: "mock/model",
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_CHAT_ID: ""
      }
    });

    assert.equal(result.json.status, "baseline_ingest_applied_no_llm_changes");
    assert.equal(result.json.openrouter_source_note_meta.id, "chat-source-note");
    assert.equal(result.json.openrouter_ingest_meta.id, "chat-ingest-plan");
    assert.equal(result.json.llm_mutation_result, null);
    assert.equal(result.json.llm_plan_auto_apply_required, false);
    assert.equal(result.json.baseline_commit_result.commit_created, true);
    assert.ok(result.json.baseline_mutation_result.created[0].startsWith("wiki/sources/"));
    assert.equal(mock.requests.length, 2);
    assert.ok(mock.requests.every((request) => request.headers["x-api-key"] === "test-key"));

    const sourceNote = await readFile(path.join(vault, result.json.baseline_mutation_result.created[0]));
    assert.match(sourceNote, /Compact workflows move fragile glue into scripts\./);

    const gitLog = await runCommand("git", ["log", "-1", "--format=%s"], { cwd: vault });
    assert.equal(gitLog.stdout.trim(), "ingest: Compact Workflow Source");
  } finally {
    await mock.close();
  }
});

test("ingest-run extracts Telegram /ingest YouTube URLs before source normalization", async () => {
  const vault = await tempDir("dps-wiki-llm-telegram-ingest-run-vault-");
  const fakeYtDlpArgs = fakeYtDlpBinaryArgs();
  await runCommand("git", ["init"], { cwd: vault });
  await runCommand("git", ["config", "user.name", "Test User"], { cwd: vault });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: vault });
  await writeFile(path.join(vault, "INDEX.md"), "# Index\n\n## Entries\n");

  const mock = await startMockOpenRouter([
    {
      body: {
        id: "chat-source-note",
        model: "mock/model",
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "A source about a YouTube transcript.",
                raw_context: "The transcript says Telegram ingest should preserve the YouTube source.",
                extracted_claims: ["Telegram ingest should preserve the YouTube source."],
                open_questions: []
              })
            },
            finish_reason: "stop"
          }
        ],
        usage: { total_tokens: 10 }
      }
    },
    {
      body: {
        id: "chat-ingest-plan",
        model: "mock/model",
        choices: [
          {
            message: {
              content: JSON.stringify({
                plan_id: "plan-telegram-youtube-noop",
                operation: "ingest",
                summary: "No reusable changes beyond the source note.",
                source_refs: ["raw/web/telegram-youtube.md"],
                page_actions: [],
                index_updates: [],
                post_actions: { reindex: true, commit: true }
              })
            },
            finish_reason: "stop"
          }
        ],
        usage: { total_tokens: 9 }
      }
    }
  ]);

  try {
    const inputPath = path.join(vault, "telegram-ingest-run-input.json");
    await writeJson(inputPath, {
      update_id: 123,
      message: {
        message_id: 456,
        chat: { id: 789 },
        text: "/ingest https://www.youtube.com/watch?v=XfpMkf4rD6E"
      },
      captured_at: "2026-04-13T12:00:00Z",
      telegram_polled: true,
      telegram_command: "ingest",
      telegram_lock_acquired: true,
      telegram_lock_id: "telegram-bot-lock-123"
    });

    const result = await runTool("ingest-run", ["--vault", vault, "--input", inputPath], {
      env: {
        OPENROUTER_API_KEY: "test-key",
        LLM_API_KEY_HEADER: "x-api-key",
        OPENROUTER_BASE_URL: mock.baseUrl,
        OPENROUTER_MODEL: "mock/model",
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_CHAT_ID: "789",
        YTDLP_BINARY: process.execPath,
        YTDLP_BINARY_ARGS: JSON.stringify(fakeYtDlpArgs),
        FAKE_YTDLP_INFO_JSON: JSON.stringify({
          id: "XfpMkf4rD6E",
          title: "Telegram YouTube Ingest",
          webpage_url: "https://www.youtube.com/watch?v=XfpMkf4rD6E",
          subtitles: {
            en: [{ ext: "vtt", name: "English" }]
          },
          automatic_captions: {}
        }),
        FAKE_YTDLP_SUBTITLE: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nTelegram ingest transcript line.\n"
      }
    });

    assert.equal(result.json.status, "baseline_ingest_applied_no_llm_changes");
    assert.equal(result.json.youtube_ingest_url, "https://www.youtube.com/watch?v=XfpMkf4rD6E");
    assert.equal(result.json.telegram_chat_id, "789");
    assert.equal(result.json.telegram_message_id, 456);
    assert.equal(result.json.telegram_update_id, 123);
    assert.equal(result.json.telegram_polled, true);
    assert.equal(result.json.telegram_lock_id, "telegram-bot-lock-123");
    assert.equal(result.json.youtube_transcript_result.status, "created");
    assert.match(result.json.source_payload.raw_path, /^raw\/web\/2026-04-13-youtube-telegram-youtube-ingest-/);
    assert.doesNotMatch(result.json.source_payload.raw_path, /raw\/inbox\/example\.md/);

    const raw = await readFile(path.join(vault, result.json.source_payload.raw_path));
    assert.match(raw, /Telegram ingest transcript line\./);
    assert.equal(mock.requests.length, 2);
  } finally {
    await mock.close();
  }
});

test("ingest-run returns a handled Telegram failure when /ingest has no URL", async () => {
  const vault = await tempDir("dps-wiki-llm-telegram-ingest-missing-url-vault-");
  const inputPath = path.join(vault, "telegram-ingest-run-input.json");
  await writeJson(inputPath, {
    update_id: 124,
    message: {
      message_id: 457,
      chat: { id: 789 },
      text: "/ingest"
    },
    telegram_polled: true,
    telegram_command: "ingest",
    telegram_lock_acquired: true,
    telegram_lock_id: "telegram-bot-lock-456"
  });

  const result = await runTool("ingest-run", ["--vault", vault, "--input", inputPath], {
    env: {
      TELEGRAM_BOT_TOKEN: "telegram-token",
      TELEGRAM_CHAT_ID: "789"
    }
  });

  assert.equal(result.json.status, "ingest_input_invalid");
  assert.equal(result.json.ingest_error, "Telegram /ingest requires a YouTube URL after the command");
  assert.equal(result.json.telegram_enabled, true);
  assert.equal(result.json.telegram_chat_id, "789");
  assert.equal(result.json.telegram_message_id, 457);
  assert.equal(result.json.telegram_update_id, 124);
  assert.equal(result.json.telegram_polled, true);
  assert.equal(result.json.telegram_lock_id, "telegram-bot-lock-456");
  assert.equal(result.json.telegram_message.chat_id, "789");
  assert.match(result.json.telegram_message.text, /KB ingest failed/);
  assert.match(result.json.telegram_message.text, /requires a YouTube URL/);
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
  assert.equal(answer.name, "KB - Telegram Bot Polling");
  assert.equal(answer.nodes.length, 23);
  assert.ok(!answer.nodes.some((node) => node.name === "Webhook"));
  assert.ok(answer.nodes.some((node) => node.name === "Call Telegram getUpdates"));
  assert.ok(answer.nodes.some((node) => node.name === "Run answer-run.ts"));
  assert.ok(answer.nodes.some((node) => node.name === "Run ingest-run.ts"));
  assert.ok(answer.nodes.some((node) => node.name === "Acquire Bot Lock"));
  assert.ok(answer.nodes.some((node) => node.name === "Release Bot Lock After Answer"));
  assert.ok(answer.nodes.some((node) => node.name === "Release Bot Lock After Ingest"));
  assert.ok(answer.nodes.some((node) => node.name === "Send Telegram Answer Log"));
  assert.ok(!answer.nodes.some((node) => node.name.includes("OpenRouter")));
  assert.match(
    answer.nodes.find((node) => node.name === "Run answer-run.ts").parameters.command,
    /answer-run\.js/
  );

  const ingest = workflows.get("kb-ingest-raw-blueprint.json");
  assert.equal(ingest.name, "KB - Ingest Raw OpenRouter Manual");
  assert.equal(ingest.nodes.length, 8);
  assert.ok(ingest.nodes.some((node) => node.name === "Run ingest-run.ts"));
  assert.ok(ingest.nodes.some((node) => node.name === "Send Telegram Ingest Log"));
  assert.ok(!ingest.nodes.some((node) => node.name.includes("OpenRouter")));
  assert.match(
    ingest.nodes.find((node) => node.name === "Run ingest-run.ts").parameters.command,
    /ingest-run\.js/
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
  assert.equal(lint.json.stats.docs, 4);
  assert.equal(lint.json.findings.length, 0);

  const health = await runTool("health-check", ["--vault", vault, "--no-write"]);
  assert.equal(health.json.kind, "health-check");
  assert.equal(health.json.stats.docs, 4);
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
