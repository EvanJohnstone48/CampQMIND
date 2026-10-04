// The Lane 1 adapter: turns the sim's shift records into RoundSnapshots, and says what the sim's own
// rules guarantee (knownEffects / knownLinks), so the narrator can say "likely" honestly.
//
// Every entry in MOTHERLODE_CONFIG is backed by a rule in packages/sim (or Lane 2's fuzzy rules),
// noted beside it. Don't add a link the code doesn't enforce: that's how a narrator starts lying.

import type { ChartExplanation, ShiftRecord, WorldEvent as SimEvent } from "@motherlode/shared";
import { ChartExplainer } from "./charts.js";
import { createNarrator, type NarratorOptions } from "./narrator.js";
import type { Card, NarratorConfig, RoundSnapshot, WorldEvent } from "./types.js";

const DIALS = [
  "caveInRisk", "farmYield", "chopYield", "digYield", "goldYield", "interestRate", "importMarkup",
  "worldFoodPrice", "worldCopperPrice", "worldGoldPrice", "bunkhouseRent", "reliefRations",
];

export const MOTHERLODE_CONFIG: NarratorConfig = {
  metrics: {
    foodPrice: { label: "the food price", format: "coins", minChange: 5 },
    timberPrice: { label: "the timber price", format: "coins", minChange: 5 },
    copperPrice: { label: "the copper price", format: "coins", minChange: 12 },
    goldPrice: { label: "the gold price", format: "coins", minChange: 25 },
    foodOutput: { label: "food harvested per shift", format: "count", minChange: 20 },
    timberOutput: { label: "timber cut per shift", format: "count", minChange: 10 },
    oreOutput: { label: "copper ore dug per shift", format: "count", minChange: 15 },
    goldOutput: { label: "gold dug per shift", format: "count", minChange: 3 },
    caveIns: { label: "cave-ins per shift", format: "count", minChange: 0.75 },
    hungry: { label: "the share of hungry miners", format: "share", minChange: 0.05 },
    roughSleepers: { label: "the share sleeping rough", format: "share", minChange: 0.05 },
    digging: { label: "the share of miners digging", format: "share", minChange: 0.08 },
    farming: { label: "the share of miners farming", format: "share", minChange: 0.08 },
    chopping: { label: "the share of miners chopping", format: "share", minChange: 0.06 },
    forest: { label: "the forest left standing", format: "share", minChange: 0.04 },
    wellbeing: { label: "average well-being", format: "number", minChange: 0.05 },
    money: { label: "money in the valley", format: "coins", minChange: 4000 },
    debt: { label: "total debt", format: "coins", minChange: 800 },
    bankRate: { label: "the bank's interest rate", format: "number", minChange: 0.004 },
    gini: { label: "wealth inequality", format: "number", minChange: 0.05 },
    copperSold: { label: "copper sold per shift", format: "count", minChange: 3 },
    goldSold: { label: "gold sold per shift", format: "count", minChange: 1 },
  },
  eventLabels: {
    goldRush: "gold rush",
    earthquake: "earthquake",
    forestFire: "forest fire",
    drought: "drought",
    priceShock: "price shock",
    lightning: "lightning strike",
    boon: "boon",
    throw: "river throw",
    creditFreeze: "credit freeze",
    creditThaw: "end of the credit freeze",
    veinExhausted: "worked-out vein",
    forestDepleted: "stripped forest",
    ...dialLabels(),
  },
  knownEffects: [
    { event: "goldRush", metric: "goldOutput", direction: "up" }, //        a rich pocket multiplies gold yield (overseer.ts)
    { event: "earthquake", metric: "caveIns", direction: "up" }, //         quake multiplies cave-in odds (production.ts)
    { event: "forestFire", metric: "forest", direction: "down" }, //        burns forest stock (overseer.ts)
    { event: "drought", metric: "foodOutput", direction: "down" }, //       halves farm yield (production.ts)
    { event: "goldRush", metric: "digging", direction: "up" }, //          a richer vein raises dig pay, so more miners dig (fuzzyBrain.ts "digPay is best")
    { event: "boon", metric: "money", direction: "up" }, //                 boons mint coins (overseer.ts)
    { event: "priceShock", metric: "copperPrice" }, //                      moves the Trading Post's world price
    { event: "priceShock", metric: "goldPrice" },
    { event: "creditFreeze", metric: "debt", direction: "down" }, //        no new loans while repayments continue (bank.ts)
    { event: "forestDepleted", metric: "timberOutput", direction: "down" }, // chop yield ~ sqrt(stock) (production.ts)
    { event: "dial:caveInRisk", metric: "caveIns" },
    { event: "dial:farmYield", metric: "foodOutput" },
    { event: "dial:chopYield", metric: "timberOutput" },
    { event: "dial:digYield", metric: "oreOutput" },
    { event: "dial:goldYield", metric: "goldOutput" },
    { event: "dial:interestRate", metric: "bankRate" },
    { event: "dial:importMarkup", metric: "foodPrice" },
    { event: "dial:worldFoodPrice", metric: "foodPrice" },
    { event: "dial:worldCopperPrice", metric: "copperPrice" },
    { event: "dial:worldGoldPrice", metric: "goldPrice" },
    { event: "dial:bunkhouseRent", metric: "roughSleepers" },
    { event: "dial:reliefRations", metric: "hungry" },
  ],
  knownLinks: [
    // Selling more gold in a shift walks down the Trading Post's demand tiers (tradingPost.ts).
    { from: "goldOutput", fromDirection: "up", to: "goldPrice", direction: "down" },
    // In a uniform-price auction against the Trading Post's fixed tiers, more sold means a lower or
    // equal clearing price, and less sold a higher or equal one (market.ts + tradingPost.ts).
    { from: "copperSold", fromDirection: "up", to: "copperPrice", direction: "down" },
    { from: "copperSold", fromDirection: "down", to: "copperPrice", direction: "up" },
    { from: "goldSold", fromDirection: "up", to: "goldPrice", direction: "down" },
    { from: "goldSold", fromDirection: "down", to: "goldPrice", direction: "up" },
    // With demand unchanged, a smaller harvest or cut can only raise the clearing price (market.ts).
    { from: "foodOutput", fromDirection: "down", to: "foodPrice", direction: "up" },
    { from: "timberOutput", fromDirection: "down", to: "timberPrice", direction: "up" },
    // Chop yield scales with the square root of the forest left (production.ts).
    { from: "forest", fromDirection: "down", to: "timberOutput", direction: "down" },
    // Output is the work miners chose to do (step.ts).
    { from: "digging", fromDirection: "up", to: "oreOutput", direction: "up" },
    { from: "digging", fromDirection: "down", to: "oreOutput", direction: "down" },
    { from: "farming", fromDirection: "up", to: "foodOutput", direction: "up" },
    { from: "farming", fromDirection: "down", to: "foodOutput", direction: "down" },
    { from: "chopping", fromDirection: "up", to: "timberOutput", direction: "up" },
    { from: "chopping", fromDirection: "down", to: "timberOutput", direction: "down" },
    // More supply with demand unchanged can only lower the clearing price (market.ts).
    { from: "foodOutput", fromDirection: "up", to: "foodPrice", direction: "down" },
    { from: "timberOutput", fromDirection: "up", to: "timberPrice", direction: "down" },
    // Lane 2's rules send miners to whatever pays best ("<work>Pay is best" in fuzzyBrain.ts).
    { from: "foodPrice", fromDirection: "up", to: "farming", direction: "up" },
    { from: "foodPrice", fromDirection: "down", to: "farming", direction: "down" },
    { from: "timberPrice", fromDirection: "up", to: "chopping", direction: "up" },
    { from: "timberPrice", fromDirection: "down", to: "chopping", direction: "down" },
    { from: "goldPrice", fromDirection: "up", to: "digging", direction: "up" },
    { from: "goldPrice", fromDirection: "down", to: "digging", direction: "down" },
    // The outside world is the only buyer of gold, so gold dug is gold sold (tradingPost.ts).
    { from: "goldOutput", fromDirection: "up", to: "goldSold", direction: "up" },
    // Metal sold to the outside world is the valley's main way to earn coins (step.ts market settlement).
    { from: "goldSold", fromDirection: "up", to: "money", direction: "up" },
    { from: "copperSold", fromDirection: "up", to: "money", direction: "up" },
    { from: "copperPrice", fromDirection: "up", to: "digging", direction: "up" },
    { from: "copperPrice", fromDirection: "down", to: "digging", direction: "down" },
  ],
  levers: [
    { metric: "hungry", direction: "up", text: "raise the soup kitchen's rations" },
    { metric: "foodPrice", direction: "up", text: "lower the import markup so outside food is cheaper" },
    { metric: "caveIns", direction: "up", text: "lower the cave-in risk dial" },
    { metric: "roughSleepers", direction: "up", text: "lower the bunkhouse rent" },
    { metric: "gini", direction: "up", text: "raise the wealth tax" },
    { metric: "bankRate", direction: "up", text: "lower the base interest rate" },
    { metric: "goldPrice", direction: "down", text: "raise the world gold price" },
    { metric: "forest", direction: "down", text: "raise forest regrowth" },
  ],
  // Lane 2's fuzzy rules (packages/agents/src/fuzzyBrain.ts), counted from each shift's decision traces.
  rules: {
    "chase-the-rumour": { label: "bold miners chase a gold rumour", metrics: ["goldOutput", "digging"] },
    "hungry-and-empty": { label: "a hungry miner with no food goes farming", metrics: ["foodOutput"] },
    "shaft-scares-me": { label: "cautious miners stay out of risky shafts", metrics: ["oreOutput", "digging"] },
    tired: { label: "a worn-out miner rests", metrics: ["wellbeing"] },
    "build-a-home": { label: "a miner who can afford it builds a house", metrics: ["roughSleepers"] },
    "treat-myself": { label: "a well-off miner buys comforts", metrics: ["money"] },
  },
};

function dialLabels(): Record<string, string> {
  const words: Record<string, string> = {
    caveInRisk: "cave-in risk", farmYield: "farm yield", chopYield: "chop yield", digYield: "dig yield", goldYield: "gold yield",
    interestRate: "interest rate", importMarkup: "import markup", worldFoodPrice: "world food price",
    worldCopperPrice: "world copper price", worldGoldPrice: "world gold price", bunkhouseRent: "bunkhouse rent", reliefRations: "soup kitchen rations",
  };
  return Object.fromEntries(DIALS.map((d) => [`dial:${d}`, `change to the ${words[d]} dial`]));
}

/** The notable things in a shift, as the narrator's suspects. Routine events (each loan, each cave-in) stay out. */
function events(e: SimEvent): WorldEvent | undefined {
  const round = e.shift;
  switch (e.kind) {
    case "act-of-god":
      return { kind: String(e.data?.act), round, source: "overseer" };
    case "god-power":
      return { kind: String(e.data?.power), round, source: "overseer" };
    case "dial-changed":
      return { kind: `dial:${e.data?.key}`, round, source: "overseer" };
    case "credit-freeze":
      return { kind: "creditFreeze", round, source: "world" };
    case "credit-thaw":
      return { kind: "creditThaw", round, source: "world" };
    case "vein-exhausted":
      return { kind: "veinExhausted", round, source: "world" };
    case "forest-depleted":
      return { kind: "forestDepleted", round, source: "world" };
    default:
      return undefined;
  }
}

export function toRoundSnapshot(record: ShiftRecord): RoundSnapshot {
  const m = record.metrics;
  const pop = Math.max(1, m.population);
  const ruleFirings: Record<string, number> = {};
  for (const a of record.activities) {
    const trace = a.trace as { brain?: string; fired?: { rule: string; strength: number }[]; fuzzy?: { fired?: { rule: string; strength: number }[] } } | undefined;
    for (const f of trace?.fired ?? trace?.fuzzy?.fired ?? []) {
      if (f.strength >= 0.5) ruleFirings[f.rule] = (ruleFirings[f.rule] ?? 0) + 1;
    }
  }
  return {
    round: record.shift,
    metrics: {
      foodPrice: m.prices.food,
      timberPrice: m.prices.timber,
      copperPrice: m.prices.copper,
      goldPrice: m.prices.gold,
      foodOutput: m.output.food,
      timberOutput: m.output.timber,
      oreOutput: m.output.copperOre,
      goldOutput: m.output.gold,
      caveIns: record.events.filter((e) => e.kind === "cave-in").length,
      hungry: m.hungryFrac,
      roughSleepers: m.roughSleepersFrac,
      digging: m.activity.dig / pop,
      farming: m.activity.farm / pop,
      chopping: m.activity.chop / pop,
      forest: m.forestFraction,
      wellbeing: m.meanWellbeing,
      money: m.money.total,
      debt: m.debt.total,
      bankRate: m.debt.ratePerDay,
      gini: m.gini,
      copperSold: m.volume.copper,
      goldSold: m.volume.gold,
    },
    events: record.events.map(events).filter((e): e is WorldEvent => !!e),
    ruleFirings,
  };
}

/**
 * Per-shift flows (what was dug, who's digging, cave-ins) swing a lot from shift to shift as miners
 * change jobs. Like any plant signal, they're filtered before analysis: a 4-shift moving average.
 * Stocks and prices are passed through as-is.
 */
// Prices too: copper and gold clear on the Trading Post's price steps, so they jump between steps shift to shift.
export const SMOOTHED_METRICS = ["foodOutput", "timberOutput", "oreOutput", "goldOutput", "caveIns", "digging", "hungry", "roughSleepers", "farming", "chopping", "foodPrice", "timberPrice", "copperPrice", "goldPrice", "copperSold", "goldSold"];
const SMOOTH_WINDOW = 4;

/**
 * Live defaults: the feed only shows changes the narrator can explain. "Cause unclear" cards (priority
 * tops out at 1.2 with a confident cause, 1.0 without) are hidden; set unclearMinPriority to 1 to show
 * only the biggest unexplained changes, or 0 to show them all.
 */
export const LIVE_SETTINGS = { unclearMinPriority: 1.01 };

/**
 * The narrator for a live world: feed it each shift's record, get that shift's new cards.
 * Keeps a bounded history and every card so far; `rewind` forgets everything after a shift.
 */
export class LiveNarrator {
  private raw: RoundSnapshot[] = [];
  private history: RoundSnapshot[] = [];
  private all: Card[] = [];
  private narrator;
  private readonly options: NarratorOptions;
  private readonly charts = new ChartExplainer();

  constructor(options: NarratorOptions = {}, private readonly config: NarratorConfig = MOTHERLODE_CONFIG) {
    this.options = { ...options, settings: { ...LIVE_SETTINGS, ...options.settings } };
    this.narrator = createNarrator(config, this.options);
  }

  async push(record: ShiftRecord): Promise<Card[]> {
    this.charts.push(record);
    const snap = toRoundSnapshot(record);
    this.raw.push(snap);
    if (this.raw.length > SMOOTH_WINDOW) this.raw.shift();
    const metrics = { ...snap.metrics };
    for (const k of SMOOTHED_METRICS) metrics[k] = this.raw.reduce((a, r) => a + r.metrics[k], 0) / this.raw.length;
    this.history.push({ ...snap, metrics });
    if (this.history.length > 200) this.history.shift();
    const cards = await this.narrator.step(this.history);
    this.all.push(...cards);
    if (this.all.length > 100) this.all.splice(0, this.all.length - 100);
    return cards;
  }

  cards(): Card[] {
    return [...this.all];
  }

  /** Explains one dashboard chart in plain words; the model words it only if every number checks out. */
  explainChart(chart: string, dials: Record<string, number>): Promise<ChartExplanation> {
    return this.charts.explain(chart, { dials, cards: this.all, llm: this.options.llm, onProblem: this.options.onProblem });
  }

  /** Forget everything after `shift` (the world was rewound). Card gating restarts too. */
  rewind(shift: number): void {
    this.history = this.history.filter((h) => h.round <= shift);
    this.raw = this.raw.filter((h) => h.round <= shift);
    this.all = this.all.filter((c) => c.round <= shift);
    this.charts.rewind(shift);
    this.narrator = createNarrator(this.config, this.options);
  }
}
