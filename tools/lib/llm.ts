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

export function openRouterUrl(): string {
  return chatCompletionsUrl();
}

export function chatCompletionsUrl(): string {
  const exactUrl = process.env.LLM_CHAT_COMPLETIONS_URL?.trim();
  if (exactUrl) {
    return exactUrl.replace(/\/+$/, "");
  }

  const baseUrl = normalizedLlmBaseUrl();
  return baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
}

function normalizedLlmBaseUrl(): string {
  const configured = (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1")
    .trim()
    .replace(/\/+$/, "");

  try {
    const url = new URL(configured);
    const host = url.hostname.toLowerCase();
    const pathName = url.pathname.replace(/\/+$/, "");

    if ((host === "openrouter.ai" || host === "www.openrouter.ai") && (pathName === "" || pathName === "/")) {
      url.hostname = "openrouter.ai";
      url.pathname = "/api/v1";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return configured;
  }

  return configured;
}

export function configuredModel(): string | undefined {
  return process.env.LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim() || undefined;
}

export function withConfiguredModel(request: ChatCompletionRequest): ChatCompletionRequest {
  const model = configuredModel();
  return {
    ...(model && !request.model ? { model } : {}),
    ...request
  };
}

export function answerTemperature(): number {
  const value = Number(process.env.LLM_ANSWER_TEMPERATURE ?? process.env.OPENROUTER_ANSWER_TEMPERATURE);
  return Number.isFinite(value) ? value : 0.2;
}

function authHeaders(): Record<string, string> {
  const headerName = process.env.LLM_API_KEY_HEADER?.trim() || "Authorization";
  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing LLM runtime configuration: LLM_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY");
  }

  const apiKeyValue = authorizationHeaderValue(headerName, apiKey);
  const headers: Record<string, string> = {
    [headerName]: apiKeyValue,
    "Content-Type": "application/json"
  };

  if (isOpenRouterEndpoint(chatCompletionsUrl())) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL || "https://localhost";
    headers["X-OpenRouter-Title"] = "dps-wiki-llm";
  }

  return headers;
}

function authorizationHeaderValue(headerName: string, apiKey: string): string {
  if (headerName.toLowerCase() !== "authorization") {
    return apiKey;
  }

  if (process.env.LLM_API_KEY_PREFIX !== undefined) {
    const prefix = process.env.LLM_API_KEY_PREFIX.trim();
    return prefix ? `${prefix} ${apiKey}` : apiKey;
  }

  return `Bearer ${apiKey}`;
}

function isOpenRouterEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === "openrouter.ai" || url.hostname.toLowerCase() === "www.openrouter.ai";
  } catch {
    return false;
  }
}

export async function chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const response = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(withConfiguredModel(request))
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

  return body as ChatCompletionResponse;
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
