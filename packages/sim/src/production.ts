// The physics of work: how much one shift yields. Pure formulas, no state changes.

import type { Dials } from "./dials";
import type { FarmState, ForestState, VeinState } from "./world";

/** How much of a full shift's effort a worker delivers: tired, sick or far-walking workers deliver less. */
export function workFactor(energy: number, health: number, travel: number): number {
  const time = Math.min(1, Math.max(0.2, 1 - travel));
  return (0.4 + 0.6 * energy) * (0.5 + 0.5 * health) * time;
}

/** Past capacity, every extra worker shrinks everyone's share. */
export function crowdFactor(workers: number, capacity: number): number {
  return workers <= capacity ? 1 : capacity / workers;
}

/** Hidden richness at the current depth: thins out exponentially. */
export function veinGrade(v: VeinState): number {
  return v.grade0 * Math.exp(-v.depth / v.gradeScale);
}

/** Hidden hardness at the current depth: deeper rock is harder. */
export function veinHardness(v: VeinState): number {
  return v.hardness0 * (1 + v.depth / 30);
}

/** Expected units per full-effort shift for one worker, before crowding. */
export function digRate(v: VeinState, skill: number, dials: Dials): number {
  if (v.exhausted) return 0;
  const base = v.ore === "gold" ? dials.goldYield : dials.digYield;
  const pocket = v.pocket ? v.pocket.multiplier : 1;
  return (base * skill * veinGrade(v) * pocket) / veinHardness(v);
}

export function unsupportedDepth(v: VeinState): number {
  return Math.max(0, v.depth - v.supportedDepth);
}

/** Chance that one dig collapses the shaft. `quake` multiplies it during an earthquake. */
export function caveInChance(v: VeinState, dials: Dials, quake = 1): number {
  const p = dials.caveInRisk * (1 + unsupportedDepth(v)) * veinHardness(v) * quake;
  return Math.min(0.5, p);
}

export function chopRate(f: ForestState, skill: number, dials: Dials): number {
  return dials.chopYield * skill * Math.sqrt(Math.max(0, f.stock) / f.capacity);
}

export function farmRate(f: FarmState, skill: number, dials: Dials, drought = 1): number {
  return dials.farmYield * skill * f.fertility * drought;
}

/** Logistic regrowth, with a trickle so a stripped forest can always come back slowly. */
export function regrowForest(f: ForestState, rate: number): number {
  const s = Math.max(0, f.stock);
  return Math.min(f.capacity, s + rate * s * (1 - s / f.capacity) + 0.5);
}
