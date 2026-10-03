import type { Good } from "./goods";
import type { ActionType } from "./brain";

/** One row of the world's time series, emitted every shift. */
export interface ShiftMetrics {
  shift: number;
  day: number;
  prices: Record<Good, number>;
  volume: Record<Good, number>;
  output: Record<Good, number>;
  consumed: Record<Good, number>;
  imports: Record<Good, number>;
  exports: Record<Good, number>;
  worldPrices: Record<Good, number>;
  money: {
    /** Miners + bank + treasury. Only changes through the Trading Post and boons. */
    total: number;
    miners: number;
    bank: number;
    treasury: number;
    /** Coins that came in / went out through the Trading Post this shift. */
    exportRevenue: number;
    importSpend: number;
    /** Coins miners spent on comforts (leaves the valley). */
    comfortSpend: number;
  };
  debt: { total: number; loans: number; issuedToday: number; defaultsToday: number; ratePerDay: number; lending: boolean };
  population: number;
  hungryFrac: number;
  starvingFrac: number;
  injuredFrac: number;
  roughSleepersFrac: number;
  housedFrac: number;
  employed: number;
  activity: Record<ActionType, number>;
  meanWellbeing: number;
  /** Wealth inequality, 0 = equal, 1 = one miner owns everything. */
  gini: number;
  forestFraction: number;
  /** Remaining ore per vein as a fraction of what it started with. */
  veinRemaining: Record<string, number>;
}
