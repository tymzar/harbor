import type { CallLog } from "../../shared/types";

// Local LiteLLM proxy (../proxy). The extension holds only the proxy's local key; the Meta key
// stays in the proxy process. Both values come from the repo's .env.local at build time.
declare const __PROXY_URL__: string;
declare const __PROXY_KEY__: string;

const TIMEOUT_MS = 90_000;

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${__PROXY_URL__}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${__PROXY_KEY__}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Model proxy answered ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json();
}

type ResponsesBody = { model?: string; output?: Array<{ content?: Array<{ text?: string }> }> };

// One SAM 3.1 request: one noun phrase, one image. Returns the raw token text.
export async function segment(concept: string, imageDataUrl: string): Promise<{ text: string; log: CallLog }> {
  const started = performance.now();
  const body = (await post("/v1/responses", {
    model: "sam",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: concept },
          { type: "input_image", image_url: imageDataUrl },
        ],
      },
    ],
  })) as ResponsesBody;
  const text = (body.output ?? []).flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("");
  return {
    text,
    log: { model: body.model ?? "sam", purpose: `segment "${concept}"`, ms: Math.round(performance.now() - started) },
  };
}

type ChatBody = {
  model?: string;
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// One Muse Spark request with strict structured output.
export async function proposeJson(
  messages: Array<ChatMessage>,
  schema: object,
  purpose: string,
  reasoningEffort: "low" | "medium" | "high" | undefined
): Promise<{ json: unknown; log: CallLog }> {
  const started = performance.now();
  const body = (await post("/v1/chat/completions", {
    model: "spark",
    messages,
    response_format: { type: "json_schema", json_schema: { name: "layout_plan", strict: true, schema } },
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  })) as ChatBody;

  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("The model ran out of output tokens before finishing the plan.");
  const content = choice?.message?.content;
  if (!content) throw new Error("The model returned an empty answer.");

  return {
    json: JSON.parse(content),
    log: {
      model: body.model ?? "spark",
      purpose,
      ms: Math.round(performance.now() - started),
      inputTokens: body.usage?.prompt_tokens,
      outputTokens: body.usage?.completion_tokens,
      reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens,
    },
  };
}
