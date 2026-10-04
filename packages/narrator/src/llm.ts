import type { EvidencePackage } from "./types.js";
import { checkRewording } from "./verify.js";

/** Anything that can turn a prompt into text. Gemini in production, a fake in tests. */
export interface LlmClient {
  generate(prompt: string, signal: AbortSignal): Promise<string>;
}

export type RewordResult =
  | { ok: true; headline: string; statements: string[] }
  | { ok: false; problems: string[] };

/**
 * Asks the model to make a card read more naturally. The model only ever sees
 * templates with {{placeholders}}, never the numbers, and every sentence it
 * returns is checked. Any failure means the caller keeps the template wording.
 */
export async function reword(pkg: EvidencePackage, client: LlmClient, timeoutMs: number): Promise<RewordResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let raw: string;
  try {
    raw = await client.generate(buildPrompt(pkg), controller.signal);
  } catch (e) {
    return { ok: false, problems: [controller.signal.aborted ? "timed out" : `model error: ${String(e)}`] };
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return { ok: false, problems: ["reply was not JSON"] };
  }
  if (!isShape(parsed) || parsed.statements.length !== pkg.statements.length) {
    return { ok: false, problems: ["reply had the wrong shape"] };
  }

  const problems = [
    ...checkRewording(pkg.headline, parsed.headline, pkg.slots),
    ...pkg.statements.flatMap((s, i) => checkRewording(s.text, parsed.statements[i], pkg.slots)),
  ];
  return problems.length ? { ok: false, problems } : { ok: true, ...parsed };
}

function buildPrompt(pkg: EvidencePackage): string {
  const names: Record<string, string> = {};
  for (const [name, slot] of Object.entries(pkg.slots)) {
    names[name] = slot.kind === "text" ? slot.text : "(a number from the data)";
  }
  const input = {
    headline: pkg.headline,
    statements: pkg.statements.map((s) => ({ kind: s.kind, text: s.text })),
    placeholders: names,
  };
  return `You reword short explanation cards for a mining simulation so they read clearly and simply.

Rules:
- Keep every {{placeholder}} exactly as written. Do not add, remove or rename any.
- Never write numbers or number words. Numbers are filled in later from the data.
- Keep certainty words exactly as given ("likely", "possibly", "unclear", "not certain"). Do not make anything sound more or less sure.
- Do not add facts, causes, advice or detail that isn't in the input.
- Keep it short and plain: one sentence per statement, everyday words.

Return only JSON: {"headline": string, "statements": [string, ...]}, with the same number of statements in the same order.

Input:
${JSON.stringify(input, null, 2)}`;
}

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function isShape(x: unknown): x is { headline: string; statements: string[] } {
  const o = x as { headline?: unknown; statements?: unknown };
  return (
    typeof o === "object" && o !== null &&
    typeof o.headline === "string" &&
    Array.isArray(o.statements) && o.statements.every((s) => typeof s === "string")
  );
}
