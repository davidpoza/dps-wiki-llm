import { createLogger } from "./logger.js";

const log = createLogger("llm");

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionRequest = {
  model?: string;
  stream?: boolean;
  temperature?: number;
  messages: ChatMessage[];
  [key: string]: unknown;
};

export type ChatCompletionResponse = {
  id?: string;
  model?: string;
  usage?: unknown;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<string | { text?: string }>;
    };
    text?: string;
  }>;
  [key: string]: unknown;
};

export type LlmMeta = {
  id: string | null;
  model: string | null;
  usage: unknown;
  finish_reason: string | null;
};

export function llmUrl(): string {
  return chatCompletionsUrl();
}

export function chatCompletionsUrl(): string {
  const baseUrl = normalizedLlmBaseUrl();
  return baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
}

function normalizedLlmBaseUrl(): string {
  const configured = process.env.LLM_BASE_URL?.trim().replace(/\/+$/, "");
  if (!configured) {
    throw new Error("Missing LLM runtime configuration: LLM_BASE_URL");
  }
  return configured;
}

export function configuredModel(): string | undefined {
  return process.env.LLM_MODEL?.trim() || undefined;
}

export function withConfiguredModel(request: ChatCompletionRequest): ChatCompletionRequest {
  const model = configuredModel();
  return {
    ...(model && !request.model ? { model } : {}),
    ...request
  };
}

export function answerTemperature(): number {
  const value = Number(process.env.LLM_ANSWER_TEMPERATURE);
  return Number.isFinite(value) ? value : 0.2;
}

function authHeaders(): Record<string, string> {
  const headerName = process.env.LLM_API_KEY_HEADER?.trim() || "Authorization";
  const apiKey = process.env.LLM_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing LLM runtime configuration: LLM_API_KEY");
  }

  const apiKeyValue = authorizationHeaderValue(headerName, apiKey);
  return {
    [headerName]: apiKeyValue,
    "Content-Type": "application/json"
  };
}

function authorizationHeaderValue(headerName: string, apiKey: string): string {
  if (headerName.toLowerCase() !== "authorization") {
    return apiKey;
  }

  return `Bearer ${apiKey}`;
}

export async function chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const resolvedRequest = withConfiguredModel(request);

  log.debug(
    {
      phase: "llm-request",
      model: resolvedRequest.model ?? null,
      temperature: resolvedRequest.temperature ?? null,
      message_count: resolvedRequest.messages.length,
      messages: resolvedRequest.messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
    },
    "llm: outgoing request"
  );

  const response = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(resolvedRequest)
  });
  const text = await response.text();
  let body: unknown;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw_response: text };
  }

  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "error" in body && typeof body.error === "object" && body.error
        ? String((body.error as { message?: unknown }).message ?? text.slice(0, 1000))
        : text.slice(0, 1000);
    throw new Error(`LLM request failed with HTTP ${response.status}: ${detail}`);
  }

  const result = body as ChatCompletionResponse;
  const choice = Array.isArray(result.choices) ? result.choices[0] : undefined;
  const content = choice?.message?.content;
  const responseText = Array.isArray(content)
    ? content.map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join("")
    : typeof content === "string"
      ? content
      : choice?.text ?? "";

  log.debug(
    {
      phase: "llm-response",
      id: typeof result.id === "string" ? result.id : null,
      model: typeof result.model === "string" ? result.model : null,
      finish_reason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
      usage: result.usage ?? null,
      response_length: responseText.length,
      response: responseText
    },
    "llm: response received"
  );

  return result;
}

export function chatText(response: ChatCompletionResponse, label: string): string {
  const choice = Array.isArray(response.choices) ? response.choices[0] : undefined;
  const content = choice?.message?.content ?? choice?.text;
  const text = Array.isArray(content)
    ? content.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("").trim()
    : typeof content === "string"
      ? content.trim()
      : "";

  if (!text) {
    throw new Error(`${label} response did not include choices[0].message.content`);
  }

  return text;
}

export function extractJson(text: string): unknown {
  const fence = String.fromCharCode(96, 96, 96);
  const stripped = text
    .trim()
    .replace(new RegExp(`^${fence}(?:json)?\\s*`, "i"), "")
    .replace(new RegExp(`${fence}$`, "i"), "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch (error) {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) {
      throw error;
    }
    return JSON.parse(match[0]);
  }
}

export function llmMeta(response: ChatCompletionResponse): LlmMeta {
  const choice = Array.isArray(response.choices) ? response.choices[0] : undefined;
  return {
    id: typeof response.id === "string" ? response.id : null,
    model: typeof response.model === "string" ? response.model : null,
    usage: response.usage ?? null,
    finish_reason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null
  };
}
