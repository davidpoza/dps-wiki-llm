import fs from "node:fs/promises";

import { parseArgs, writeJsonStdout } from "./lib/cli.js";

const DEFAULT_WORKFLOW_PATHS = [
  "n8n/workflows/kb-answer-blueprint.json",
  "n8n/workflows/kb-ingest-raw-blueprint.json"
];

const OPENROUTER_CALL_NODE_NAMES = new Set([
  "Call OpenRouter Answer",
  "Call OpenRouter Feedback",
  "Call OpenRouter Ingest Planner",
  "Call OpenRouter Source Note Cleaner"
]);

type WorkflowNode = {
  name?: string;
  type?: string;
  typeVersion?: number;
  parameters?: Record<string, unknown>;
  notes?: string;
};

type Workflow = {
  nodes?: WorkflowNode[];
};

type RenderedWorkflow = {
  path: string;
  updated_nodes: string[];
};

function llmHeaderName(): string {
  return process.env.LLM_API_KEY_HEADER?.trim() || "Authorization";
}

function llmHeaderValueExpression(headerName: string): string {
  if (headerName.toLowerCase() === "authorization") {
    return "={{ 'Bearer ' + $env.OPENROUTER_API_KEY }}";
  }

  return "={{ $env.OPENROUTER_API_KEY }}";
}

function openRouterHttpRequestParameters(headerName: string): Record<string, unknown> {
  return {
    method: "POST",
    url: "={{ $json.openrouter_url }}",
    authentication: "none",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: headerName,
          value: llmHeaderValueExpression(headerName)
        },
        {
          name: "Content-Type",
          value: "application/json"
        },
        {
          name: "HTTP-Referer",
          value: "={{ $env.OPENROUTER_SITE_URL || 'https://localhost' }}"
        },
        {
          name: "X-OpenRouter-Title",
          value: "dps-wiki-llm"
        }
      ]
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.openrouter_request) }}",
    options: {}
  };
}

async function renderWorkflow(filePath: string, headerName: string, write: boolean): Promise<RenderedWorkflow> {
  const workflow = JSON.parse(await fs.readFile(filePath, "utf8")) as Workflow;
  const updatedNodes: string[] = [];

  for (const node of workflow.nodes ?? []) {
    if (!node.name || !OPENROUTER_CALL_NODE_NAMES.has(node.name)) {
      continue;
    }

    node.type = "n8n-nodes-base.httpRequest";
    node.typeVersion = 4.2;
    node.parameters = openRouterHttpRequestParameters(headerName);
    node.notes =
      "Calls the LLM API through n8n HTTP Request with a render-time API-key header. " +
      "LLM_API_KEY_HEADER defaults to Authorization; non-Authorization headers receive the raw OPENROUTER_API_KEY value.";
    updatedNodes.push(node.name);
  }

  if (write) {
    await fs.writeFile(filePath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  }

  return {
    path: filePath,
    updated_nodes: updatedNodes
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const headerName = llmHeaderName();
  const workflowPaths = args._.length > 0 ? args._ : DEFAULT_WORKFLOW_PATHS;
  const rendered: RenderedWorkflow[] = [];

  for (const workflowPath of workflowPaths) {
    rendered.push(await renderWorkflow(workflowPath, headerName, args.write));
  }

  writeJsonStdout(
    {
      status: args.write ? "written" : "rendered",
      header_name: headerName,
      workflow_count: rendered.length,
      workflows: rendered
    },
    args.pretty
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
