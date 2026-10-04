// Talking to Google Gemini. Kept behind a tiny LlmClient interface so tests (and other
// providers later) can swap it out. The key comes from .env (GEMINI_API_KEY); never hard-code it.

export interface LlmRequest {
  system: string;
  user: string;
  /** Gemini response schema (OpenAPI subset). The reply is forced to be JSON of this shape. */
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmClient {
  model: string;
  generate(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}

/** Paid-tier list prices, USD per million tokens. The free tier costs nothing but has rate limits. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
};

export const DEFAULT_MODEL = "gemini-2.5-flash-lite";

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES[DEFAULT_MODEL];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  /** For tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export function geminiClient(opts: GeminiOptions): LlmClient {
  const model = opts.model || DEFAULT_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return {
    model,
    async generate(req, signal) {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: req.schema,
            maxOutputTokens: req.maxOutputTokens ?? 300,
            temperature: req.temperature ?? 0.8,
            // Thinking adds latency and cost; a miner's shift doesn't need it.
            ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new Error("Gemini returned no text");
      return {
        text,
        inputTokens: data.usageMetadata?.promptTokenCount ?? Math.ceil((req.system.length + req.user.length) / 4),
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4),
      };
    },
  };
}
