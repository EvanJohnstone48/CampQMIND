// The one thing every miner is trying to improve.
//
// Well-being is a weighted sum of needs, each passed through a concave curve: the first
// meal matters far more than the tenth, and an extra coin is worth less to the rich than
// to the poor. That one property does most of the economic balancing:
//   - rich miners rest more and work less, which caps runaway inequality;
//   - hungry miners will pay almost anything for food, so shortages spike prices;
//   - when everyone does the same job, its price falls and others become better choices.
// Pure functions: brains import these to score actions before choosing.

import { GOODS, type Good, type HomeKind, type Inventory, type Needs } from "@motherlode/shared";

export const NEED_WEIGHTS: Needs = {
  nourishment: 0.28,
  energy: 0.14,
  shelter: 0.14,
  health: 0.16,
  security: 0.18,
  comfort: 0.1,
};

/** Concave 0..1 -> 0..1. */
export function needUtility(x: number): number {
  return Math.log1p(9 * clamp01(x)) / Math.log(10);
}

/**
 * Well-being, roughly -1 (starving, sick) to 1 (thriving), plus any social term from Lane 2.
 * Going hungry or badly hurt costs far more than the curve alone, so survival comes first.
 */
export function wellbeing(needs: Needs, social = 0): number {
  let w = 0;
  for (const k of Object.keys(NEED_WEIGHTS) as (keyof Needs)[]) w += NEED_WEIGHTS[k] * needUtility(needs[k]);
  if (needs.nourishment < 0.2) w -= (0.2 - needs.nourishment) * 3;
  if (needs.health < 0.3) w -= (0.3 - needs.health) * 2;
  return w + social;
}

export const SHELTER: Record<HomeKind, number> = { house: 1, bunkhouse: 0.6, rough: 0.15 };

/** How well a night's rest restores energy, by where you sleep. */
export const REST_QUALITY: Record<HomeKind, number> = { house: 1, bunkhouse: 0.85, rough: 0.5 };

/** Cash + goods at last prices - debt. Houses count through shelter, not here. */
export function netWorth(cash: number, inventory: Inventory, debt: number, prices: Record<Good, number>): number {
  let v = cash - debt;
  for (const g of GOODS) v += inventory[g] * prices[g];
  return v;
}

/** Coins a miner needs per day to eat and rent a bed at current prices. */
export function costOfLivingPerDay(foodPrice: number, dials: Record<string, number>): number {
  const mealsPerDay = (2 * dials.hungerPerShift) / dials.mealNourishment;
  return Math.max(1, foodPrice * mealsPerDay + 2 * dials.bunkhouseRent);
}

/** Financial security: how many days you could live on what you own, squashed to 0..1 (15 days ~ 0.63). */
export function security(worth: number, costPerDay: number): number {
  const days = Math.max(0, worth) / Math.max(1, costPerDay);
  return 1 - Math.exp(-days / 15);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
