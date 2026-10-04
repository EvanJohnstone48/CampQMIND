// What an LLM miner is told, and the shape of its answer.
//
// The model never invents actions or numbers the world doesn't allow: it picks one option from a
// menu the code built (with the code's own income estimates), says how much to spend, borrow or
// repay, and gives its reasoning in its own words. Trading is left to the shared trade planner.

import type { Observation } from "@motherlode/shared";
import type { Option } from "../options";
import type { MinerTraits } from "../population";

export interface MemoryEntry {
  shift: number;
  did: string;
  earned: number;
  thought?: string;
}

export interface LlmAnswer {
  choice: string;
  spend: number;
  borrow: number;
  repay: number;
  thought: string;
}

export function answerSchema(optionKeys: string[]): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: {
      choice: { type: "STRING", enum: optionKeys, description: "The key of the option you pick." },
      spend: { type: "INTEGER", description: "Coins to spend on comforts this shift (0 if none)." },
      borrow: { type: "INTEGER", description: "Coins to borrow from the bank (0 if none)." },
      repay: { type: "INTEGER", description: "Extra coins to repay on loans (0 if none)." },
      thought: { type: "STRING", description: "One or two sentences, in character, on why." },
    },
    required: ["choice", "spend", "borrow", "repay", "thought"],
    propertyOrdering: ["thought", "choice", "spend", "borrow", "repay"],
  };
}

export function systemPrompt(name: string, traits: MinerTraits): string {
  return [
    `You are ${name}, a miner in Motherlode, a small mining valley. ${traits.bio}`,
    "Each shift you choose one thing to do. You want a good life: enough food, rest, a roof (a house is best),",
    "good health, savings to feel secure, and a few comforts. Nobody tells you what to do.",
    "Pick exactly one option by its key. Income figures are honest estimates, not promises.",
    "Spend on comforts only from real savings. Only borrow what you can repay; missing three payments means foreclosure.",
    "Reply with JSON only, staying in character in the thought.",
  ].join(" ");
}

export function userPrompt(obs: Observation, options: Option[], memory: MemoryEntry[], costPerDay: number): string {
  const me = obs.self;
  const n = me.needs;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const inv = Object.entries(me.inventory).filter(([, q]) => q > 0).map(([g, q]) => `${q} ${g}`).join(", ") || "nothing";
  const prices = Object.entries(obs.prices).map(([g, p]) => `${g} ${p.last}`).join(", ");
  const news = obs.witnessed.slice(0, 5).map((e) => `- ${e.text ?? e.kind}`).join("\n");
  const past = memory.slice(-5).map((m) => `- shift ${m.shift}: ${m.did}, earned ${m.earned}${m.thought ? ` ("${m.thought}")` : ""}`).join("\n");
  const menu = options.map((o) => `- ${o.key}: ${o.label}, about ${Math.round(o.income)} coins${o.risk ? `, cave-in risk ${(o.risk * 100).toFixed(1)}%` : ""}`).join("\n");
  return [
    `Shift ${obs.shift} (day ${obs.day}).`,
    `You: food ${pct(n.nourishment)}, energy ${pct(n.energy)}, health ${pct(n.health)}, comfort ${pct(n.comfort)}. Home: ${me.home.kind}.`,
    `Money: ${me.cash} coins, debt ${me.debt}. Living costs about ${Math.round(costPerDay)} coins a day. You carry: ${inv}.`,
    me.employment ? `You work for ${me.employment.employerId} at ${me.employment.wage} a shift.` : "",
    `Prices: ${prices}. The bank ${obs.bank.lending ? `would lend you up to ${obs.bank.myLimit}` : "is not lending"} at ${(obs.bank.ratePerDay * 100).toFixed(1)}% a day.`,
    news ? `What you saw lately:\n${news}` : "",
    past ? `Your last few shifts:\n${past}` : "",
    `Options:\n${menu}`,
  ].filter(Boolean).join("\n");
}

/** Reads the model's JSON defensively: anything malformed becomes undefined (the caller falls back). */
export function parseAnswer(text: string, optionKeys: string[]): LlmAnswer | undefined {
  try {
    const a = JSON.parse(text) as Partial<LlmAnswer>;
    if (typeof a.choice !== "string" || !optionKeys.includes(a.choice)) return undefined;
    const int = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
    return { choice: a.choice, spend: int(a.spend), borrow: int(a.borrow), repay: int(a.repay), thought: String(a.thought ?? "").slice(0, 300) };
  } catch {
    return undefined;
  }
}
