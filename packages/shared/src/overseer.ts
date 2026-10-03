// What the Overseer (the player) can do to the world.

import type { Good } from "./goods";

export type ActOfGodKind = "earthquake" | "goldRush" | "forestFire" | "drought" | "priceShock";
export type GodPowerKind = "lightning" | "boon" | "throw";

export type OverseerAction =
  | { type: "setDial"; key: string; value: number }
  | {
      type: "actOfGod";
      kind: ActOfGodKind;
      /** Earthquake / forest fire / drought: limit to one map region (default: whole valley). */
      region?: string;
      /** Gold rush: which vein (default: a seeded pick among gold veins). */
      siteId?: string;
      /** Price shock: which good (copper or gold), and the multiplier (0.5 = halve). */
      good?: Good;
      magnitude?: number;
    }
  | {
      type: "godPower";
      kind: GodPowerKind;
      minerId: string;
      /** Boon: coins granted (default: the boonSize dial). */
      amount?: number;
    };

export interface DialDef {
  key: string;
  label: string;
  group: "economy" | "tradingPost" | "bank" | "town" | "nature" | "mining" | "needs";
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
  description: string;
}
