// Where the miners' brains plug in: the integration point between the world (Lane 1) and minds (Lane 2).
//
// BRAINS=agents (default): Lane 2's town. Fuzzy minds for everyone, plus Gemini-driven miners
//   (LLM_SHARE, default 0.25) when GEMINI_API_KEY is set.
// BRAINS=baseline: the sim's simple reference brain, with the sim's default population.
//
// A BrainProvider gets every miner's observation and returns their intents (it may be async).
// Miners it doesn't answer for in time fall back to the town's synchronous brain.

import type { Brain, Intent, MinerSeed, Observation } from "@motherlode/shared";
import { createAgents, fuzzyBrain, geminiFromEnv, type LlmStats } from "@motherlode/agents";
import { baselineBrain, type WorldState } from "@motherlode/sim";

export type BrainProvider = (observations: Record<string, Observation>, state: WorldState) => Promise<Record<string, Intent>>;

export interface Town {
  name: string;
  population: MinerSeed[] | number;
  brains: BrainProvider;
  /** Synchronous brain for forks and late answers. */
  syncBrain: Brain;
  llmStats: () => LlmStats | undefined;
}

export const baselineProvider: BrainProvider = async (obs) => {
  const out: Record<string, Intent> = {};
  for (const [id, o] of Object.entries(obs)) out[id] = baselineBrain(o);
  return out;
};

export function pickTown(env: Record<string, string | undefined>, seed: string, count: number): Town {
  const kind = env.BRAINS || "agents";
  if (kind === "baseline") return { name: "baseline", population: count, brains: baselineProvider, syncBrain: baselineBrain, llmStats: () => undefined };
  if (kind !== "agents") console.warn(`Unknown BRAINS="${kind}", using Lane 2's agents.`);

  const llm = geminiFromEnv(env);
  const num = (k: string) => (env[k] !== undefined && env[k] !== "" && Number.isFinite(Number(env[k])) ? Number(env[k]) : undefined);
  const agents = createAgents({
    seed,
    count,
    llm,
    llmShare: num("LLM_SHARE"),
    llmOptions: { rpm: num("LLM_RPM"), dailyCap: num("LLM_DAILY_CAP"), timeoutMs: num("LLM_TIMEOUT_MS"), replanEvery: num("LLM_REPLAN_EVERY") },
  });
  if (!llm) console.log("No GEMINI_API_KEY: every miner uses the fuzzy brain.");
  return { name: llm ? `agents (fuzzy + ${llm.model})` : "agents (fuzzy)", population: agents.population, brains: (obs) => agents.decideAll(obs), syncBrain: fuzzyBrain, llmStats: agents.llmStats };
}
