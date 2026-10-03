// Every tunable rule of the world. Lane 4 generates the sliders from this list.
// Money is in whole coins, goods in whole units, rates per shift unless the unit says otherwise.

import type { DialDef } from "@motherlode/shared";

export const DIAL_DEFS: DialDef[] = [
  // Trading Post: the valley's only link to the outside world.
  { key: "worldFoodPrice", label: "World food price", group: "tradingPost", min: 5, max: 120, step: 1, default: 30, unit: "coins", description: "Outside-world price of food. The Trading Post sells imports above it and buys surplus below it." },
  { key: "worldTimberPrice", label: "World timber price", group: "tradingPost", min: 5, max: 120, step: 1, default: 25, unit: "coins", description: "Outside-world price of timber." },
  { key: "worldCopperPrice", label: "World copper price", group: "tradingPost", min: 20, max: 600, step: 5, default: 120, unit: "coins", description: "What the outside world pays for copper before the town floods the market." },
  { key: "worldGoldPrice", label: "World gold price", group: "tradingPost", min: 50, max: 1500, step: 10, default: 300, unit: "coins", description: "What the outside world pays for gold before the town floods the market." },
  { key: "importMarkup", label: "Import markup", group: "tradingPost", min: 1, max: 3, step: 0.05, default: 1.5, unit: "x", description: "Imports cost world price times this; food and timber surplus sells for world price divided by it." },
  { key: "exportDepth", label: "Export market depth", group: "tradingPost", min: 2, max: 60, step: 1, default: 12, unit: "units", description: "How much copper the outside world takes per shift at each price tier before the price steps down. Gold uses a quarter of this." },
  { key: "worldPriceVolatility", label: "World price volatility", group: "tradingPost", min: 0, max: 0.1, step: 0.005, default: 0.02, unit: "per shift", description: "How much outside-world prices wander each shift." },
  { key: "exportLevy", label: "Export levy", group: "town", min: 0, max: 0.3, step: 0.01, default: 0.05, unit: "share", description: "Share of Trading Post sales that goes to the town treasury." },

  // Bank
  { key: "interestRate", label: "Interest rate", group: "bank", min: 0, max: 0.1, step: 0.002, default: 0.01, unit: "per day", description: "Base daily interest on loans. The bank charges up to 3x this when its reserves run low." },
  { key: "loanTermDays", label: "Loan term", group: "bank", min: 5, max: 60, step: 1, default: 20, unit: "days", description: "Days to repay a loan in equal installments." },
  { key: "missedToDefault", label: "Missed payments to default", group: "bank", min: 1, max: 10, step: 1, default: 3, unit: "payments", description: "Consecutive missed payments before the bank forecloses." },
  { key: "creditBanDays", label: "Credit ban", group: "bank", min: 0, max: 100, step: 1, default: 30, unit: "days", description: "How long a defaulter is barred from borrowing." },
  { key: "baseLoanLimit", label: "Base loan limit", group: "bank", min: 0, max: 2000, step: 10, default: 150, unit: "coins", description: "What anyone can borrow before income and net worth are counted." },
  { key: "freezeReserveFraction", label: "Credit freeze point", group: "bank", min: 0, max: 0.8, step: 0.05, default: 0.2, unit: "share", description: "The bank stops lending when its reserves fall below this share of its starting reserves." },

  // Town
  { key: "bunkhouseRent", label: "Bunkhouse rent", group: "town", min: 0, max: 50, step: 1, default: 6, unit: "coins/shift", description: "Rent for a bunkhouse bed. Miners who can't pay sleep rough." },
  { key: "lotPrice", label: "House lot price", group: "town", min: 0, max: 2000, step: 10, default: 200, unit: "coins", description: "Paid to the town to start building on an empty lot." },
  { key: "houseTimber", label: "House timber", group: "town", min: 0, max: 50, step: 1, default: 10, unit: "units", description: "Timber needed to start a house." },
  { key: "houseCopper", label: "House copper", group: "town", min: 0, max: 20, step: 1, default: 4, unit: "units", description: "Copper needed to start a house." },
  { key: "houseLabour", label: "House labour", group: "town", min: 1, max: 30, step: 1, default: 6, unit: "shifts", description: "Skill-weighted shifts of work to finish a house." },
  { key: "houseSalvage", label: "Foreclosure salvage", group: "town", min: 0, max: 1000, step: 10, default: 150, unit: "coins", description: "What the town pays the bank for a foreclosed house." },
  { key: "reliefRations", label: "Soup kitchen", group: "town", min: 0, max: 4, step: 1, default: 2, unit: "rations/day", description: "Rations the treasury imports each day for hungry miners who have no food and almost no cash." },
  { key: "reliefCashThreshold", label: "Relief cash threshold", group: "town", min: 0, max: 500, step: 10, default: 60, unit: "coins", description: "Miners with less cash than this can get relief when hungry." },
  { key: "wealthTax", label: "Wealth tax", group: "town", min: 0, max: 0.05, step: 0.001, default: 0.002, unit: "per day", description: "Daily share of cash above the exemption paid to the treasury (and so back to everyone as the dividend)." },
  { key: "wealthTaxExemption", label: "Wealth tax exemption", group: "town", min: 0, max: 20000, step: 100, default: 4000, unit: "coins", description: "Cash below this is never taxed." },
  { key: "treasuryReserve", label: "Treasury reserve", group: "town", min: 0, max: 50000, step: 500, default: 4000, unit: "coins", description: "The treasury shares a tenth of anything above this equally among all miners each day." },

  // Needs
  { key: "hungerPerShift", label: "Hunger rate", group: "needs", min: 0.05, max: 0.5, step: 0.01, default: 0.2, unit: "per shift", description: "Nourishment lost each shift." },
  { key: "mealNourishment", label: "Meal size", group: "needs", min: 0.1, max: 1, step: 0.05, default: 0.4, unit: "per ration", description: "Nourishment restored by eating one food." },
  { key: "eatBelow", label: "Appetite", group: "needs", min: 0.2, max: 1, step: 0.05, default: 0.7, unit: "nourishment", description: "Miners eat automatically when nourishment drops below this." },
  { key: "workEnergyCost", label: "Work fatigue", group: "needs", min: 0, max: 0.6, step: 0.01, default: 0.2, unit: "per shift", description: "Energy a shift of work costs." },
  { key: "restEnergyGain", label: "Rest recovery", group: "needs", min: 0.05, max: 1, step: 0.05, default: 0.45, unit: "per shift", description: "Energy a shift of rest restores in a house (less in the bunkhouse, much less sleeping rough)." },
  { key: "starvationHealthLoss", label: "Starvation damage", group: "needs", min: 0, max: 0.5, step: 0.01, default: 0.1, unit: "per shift", description: "Health lost each shift with no nourishment." },
  { key: "healthRecovery", label: "Healing", group: "needs", min: 0, max: 0.2, step: 0.01, default: 0.03, unit: "per shift", description: "Health regained each shift when fed (doubled when resting)." },
  { key: "comfortCost", label: "Price of comforts", group: "needs", min: 20, max: 2000, step: 10, default: 300, unit: "coins", description: "Coins of imported comforts that take a miner from no comfort to full comfort. The money leaves the valley." },
  { key: "comfortDecay", label: "Comfort wear-off", group: "needs", min: 0, max: 0.5, step: 0.01, default: 0.08, unit: "per shift", description: "How fast comfort fades." },
  { key: "foodSpoilage", label: "Food spoilage", group: "needs", min: 0, max: 0.2, step: 0.005, default: 0.02, unit: "per shift", description: "Share of stored food that rots each shift." },

  // Nature
  { key: "farmYield", label: "Farm yield", group: "nature", min: 0, max: 12, step: 0.5, default: 6, unit: "food/shift", description: "Food from one average farmer-shift on a fertile plot." },
  { key: "chopYield", label: "Chop yield", group: "nature", min: 0, max: 12, step: 0.5, default: 3, unit: "timber/shift", description: "Timber from one average chopper-shift in a full forest." },
  { key: "forestRegrowth", label: "Forest regrowth", group: "nature", min: 0, max: 0.2, step: 0.005, default: 0.03, unit: "per shift", description: "Logistic regrowth rate of forests: fastest at half-full, slow when stripped." },
  { key: "fertilityDrain", label: "Soil exhaustion", group: "nature", min: 0, max: 0.1, step: 0.001, default: 0.003, unit: "per farmer-shift", description: "Fertility lost per shift of farming." },
  { key: "fertilityRecovery", label: "Soil recovery", group: "nature", min: 0, max: 0.1, step: 0.002, default: 0.02, unit: "per shift", description: "Fertility regained each shift." },

  // Mining
  { key: "digYield", label: "Copper dig yield", group: "mining", min: 0, max: 15, step: 0.5, default: 4, unit: "ore/shift", description: "Copper ore from an average miner-shift at the surface of an average vein." },
  { key: "goldYield", label: "Gold dig yield", group: "mining", min: 0, max: 3, step: 0.05, default: 0.35, unit: "gold/shift", description: "Gold from an average miner-shift at the surface of an average gold vein." },
  { key: "orePerLevel", label: "Ore per depth level", group: "mining", min: 10, max: 500, step: 10, default: 150, unit: "units", description: "Ore dug out before a shaft gets one level deeper (harder, poorer, needs another support)." },
  { key: "supportTimber", label: "Timber per support", group: "mining", min: 0, max: 10, step: 1, default: 2, unit: "timber/level", description: "Timber needed to shore up each new level of a shaft." },
  { key: "caveInRisk", label: "Cave-in risk", group: "mining", min: 0, max: 0.1, step: 0.001, default: 0.008, unit: "per dig", description: "Base chance of a cave-in per dig; multiplied by unsupported depth and hardness." },
  { key: "injuryShifts", label: "Injury length", group: "mining", min: 0, max: 30, step: 1, default: 6, unit: "shifts", description: "How long a cave-in or lightning strike keeps a miner off work." },
  { key: "smeltCapacity", label: "Smelt capacity", group: "mining", min: 1, max: 20, step: 1, default: 6, unit: "ore/shift", description: "Ore an average worker can smelt in a shift. Two ore make one copper." },
  { key: "maxSmelterFee", label: "Smelter fee cap", group: "town", min: 0, max: 100, step: 1, default: 15, unit: "coins/ore", description: "Town regulation: the most a smelter owner may charge per unit of ore." },
  { key: "smeltFuel", label: "Smelt fuel", group: "mining", min: 0, max: 1, step: 0.05, default: 0.25, unit: "timber/ore", description: "Timber burned per unit of ore smelted." },

  // Overseer powers
  { key: "boonSize", label: "Boon size", group: "economy", min: 0, max: 5000, step: 50, default: 500, unit: "coins", description: "Default windfall granted by a boon." },
  { key: "lightningDestroy", label: "Lightning damage", group: "economy", min: 0, max: 1, step: 0.05, default: 0.5, unit: "share", description: "Share of a struck miner's goods destroyed by lightning." },
];

export type Dials = Record<string, number>;

export function defaultDials(): Dials {
  const out: Dials = {};
  for (const d of DIAL_DEFS) out[d.key] = d.default;
  return out;
}

export function dialDef(key: string): DialDef | undefined {
  return DIAL_DEFS.find((d) => d.key === key);
}

/** Clamps a requested value into the dial's range. Returns undefined for unknown dials. */
export function clampDial(key: string, value: number): number | undefined {
  const def = dialDef(key);
  if (!def || !Number.isFinite(value)) return undefined;
  return Math.min(def.max, Math.max(def.min, value));
}
