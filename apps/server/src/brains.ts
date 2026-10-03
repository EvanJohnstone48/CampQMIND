// Where the miners' brains plug in. This is the one integration point with Lane 2.
//
// A BrainProvider gets every miner's observation and returns their intents (it may be async,
// e.g. LLM calls). Miners it doesn't answer for in time fall back to the baseline brain.
// To wire in Lane 2: import their provider (e.g. from "@motherlode/agents") and return it
// from pickBrains() when BRAINS=agents.

import type { Intent, Observation } from "@motherlode/shared";
import { baselineBrain, type WorldState } from "@motherlode/sim";

export type BrainProvider = (observations: Record<string, Observation>, state: WorldState) => Promise<Record<string, Intent>>;

export const baselineProvider: BrainProvider = async (obs) => {
  const out: Record<string, Intent> = {};
  for (const [id, o] of Object.entries(obs)) out[id] = baselineBrain(o);
  return out;
};

export function pickBrains(name: string | undefined): BrainProvider {
  switch (name ?? "baseline") {
    case "baseline":
      return baselineProvider;
    default:
      console.warn(`Unknown BRAINS="${name}", using the baseline brain.`);
      return baselineProvider;
  }
}
