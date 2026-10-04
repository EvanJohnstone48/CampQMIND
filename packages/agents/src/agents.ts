// The whole town's minds in one object: the population, and a decideAll() the server calls each shift.
//
//   const agents = createAgents({ seed: "demo", llm: geminiFromEnv() });
//   world = createWorld({ seed, map, population: agents.population });
//   intents = await agents.decideAll(observeAll(ctx, state));

import type { Intent, MinerPublic, MinerSeed, Observation } from "@motherlode/shared";
import { fuzzyBrain } from "./fuzzyBrain";
import { geminiClient, type LlmClient } from "./llm/gemini";
import { LlmMind, type LlmMindOptions, type LlmStats } from "./llm/llmMind";
import { generatePopulation, traitsOf } from "./population";

export interface AgentsOptions {
  seed: string;
  count?: number;
  /** Share of miners with LLM brains (default 0.25). Ignored (0) without an LLM client. */
  llmShare?: number;
  llm?: LlmClient;
  llmOptions?: Partial<Omit<LlmMindOptions, "client">>;
}

export interface Agents {
  population: MinerSeed[];
  decideAll(observations: Record<string, Observation>): Promise<Record<string, Intent>>;
  /** LLM usage and cost so far (undefined when there are no LLM miners). */
  llmStats(): LlmStats | undefined;
}

export function createAgents(opts: AgentsOptions): Agents {
  const share = opts.llm ? opts.llmShare ?? 0.25 : 0;
  const population = generatePopulation(opts.seed, opts.count ?? 100, share);
  const llmIds = new Set(population.filter((p) => traitsOf(p.traits).brain === "llm").map((p) => p.id));
  const mind = opts.llm && llmIds.size ? new LlmMind({ client: opts.llm, ...opts.llmOptions }) : undefined;

  return {
    population,
    async decideAll(observations) {
      const out: Record<string, Intent> = {};
      const llmObs: Observation[] = [];
      for (const [id, obs] of Object.entries(observations)) {
        if (mind && llmIds.has(id)) llmObs.push(obs);
        else out[id] = fuzzyBrain(obs);
      }
      if (mind && llmObs.length) Object.assign(out, await mind.decide(llmObs));
      return out;
    },
    llmStats: () => mind?.stats(),
  };
}

/** A Gemini client from GEMINI_API_KEY / GEMINI_MODEL, or undefined when there's no key. */
export function geminiFromEnv(env: Record<string, string | undefined> = process.env): LlmClient | undefined {
  const apiKey = env.GEMINI_API_KEY?.trim();
  return apiKey ? geminiClient({ apiKey, model: env.GEMINI_MODEL?.trim() || undefined }) : undefined;
}

export interface BrainScore {
  miners: number;
  meanCash: number;
  meanDebt: number;
  meanWellbeing: number;
}

/** The head-to-head: do fuzzy or LLM miners end up better off? */
export function compareBrains(miners: MinerPublic[]): Record<string, BrainScore> {
  const groups: Record<string, MinerPublic[]> = {};
  for (const m of miners) (groups[m.brain ?? "unknown"] ??= []).push(m);
  const out: Record<string, BrainScore> = {};
  for (const [brain, ms] of Object.entries(groups)) {
    const mean = (f: (m: MinerPublic) => number) => Math.round((ms.reduce((a, m) => a + f(m), 0) / ms.length) * 1000) / 1000;
    out[brain] = { miners: ms.length, meanCash: mean((m) => m.cash), meanDebt: mean((m) => m.debt), meanWellbeing: mean((m) => m.wellbeing) };
  }
  return out;
}
