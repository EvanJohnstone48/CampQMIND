import type { LlmClient } from "./llm.js";

/**
 * Gemini over plain REST, so the package needs no SDK. Server-side only: the
 * key must never reach the browser. Set GEMINI_MODEL in .env to change model.
 */
export function createGeminiClient(apiKey: string, model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash"): LlmClient {
  return {
    async generate(prompt, signal) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (!text) throw new Error("Gemini returned no text");
      return text;
    },
  };
}
