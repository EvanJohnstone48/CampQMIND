// The five goods in v1. The crusher -> flotation -> smelter chain is merged into one smelter step.

export const GOODS = ["food", "timber", "copperOre", "copper", "gold"] as const;
export type Good = (typeof GOODS)[number];

/** Whole units of each good. Goods are always integers. */
export type Inventory = Record<Good, number>;

export function emptyInventory(): Inventory {
  return { food: 0, timber: 0, copperOre: 0, copper: 0, gold: 0 };
}
