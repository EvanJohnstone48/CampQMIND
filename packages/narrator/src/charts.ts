// Chart explanations for the dashboard: "what is this graph, and why does it look like that?"
//
// Same recipe as the cards. Plain code finds the facts: what the chart measures and the rules behind
// it (with today's numbers), how the line moved, what else changed at the same time, and what
// happened in the world. The model only words those facts for someone with no economics background.
// Every number it writes must appear in the facts, or we fall back to the template wording.

import type { ChartExplanation, ShiftMetrics, ShiftRecord, WorldEvent as SimEvent } from "@motherlode/shared";
import type { LlmClient } from "./llm.js";
import type { Card } from "./types.js";

type Fmt = "coins" | "share" | "count" | "number";

interface Line {
  label: string;
  get: (m: ShiftMetrics) => number;
  format?: Fmt;
}

interface Ctx {
  m: ShiftMetrics;
  dials: Record<string, number>;
}

interface ChartSpec {
  title: string;
  format: Fmt;
  /** The lines drawn on the chart. The first one is the one explained in most detail. */
  lines: Line[];
  /** Things that push this chart around, followed alongside it. */
  drivers: Line[];
  /** What it is and the rules behind it, in everyday words, with today's numbers. */
  about: (c: Ctx) => string[];
  /** Narrator card topics worth quoting. */
  topics: string[];
  /** The outside world's price limits for the first line, each shift (staples only). */
  limits?: (m: ShiftMetrics, dials: Record<string, number>) => [number, number];
}

const stapleLimits = (good: "food" | "timber") => (m: ShiftMetrics, d: Record<string, number>): [number, number] => {
  const mk = d.importMarkup ?? 1.5;
  return [Math.max(1, Math.floor(m.worldPrices[good] / mk)), Math.max(1, Math.ceil(m.worldPrices[good] * mk))];
};

const act = (k: keyof ShiftMetrics["activity"], label: string): Line => ({ label, get: (m) => m.activity[k], format: "count" });
const MARKUP = (c: Ctx) => c.dials.importMarkup ?? 1.5;
const DEPTH = (c: Ctx) => c.dials.exportDepth ?? 12;
const STAIRS = "the first {n} units each shift get the full price, the next {n} get 85% of it, the next {n} get 70%, and everything after that only 55%";

function stapleRules(good: "food" | "timber", c: Ctx): string[] {
  const world = c.m.worldPrices[good];
  const floor = Math.max(1, Math.floor(world / MARKUP(c)));
  const ceiling = Math.max(1, Math.ceil(world * MARKUP(c)));
  return [
    `The outside world sets hard limits through the Trading Post: it always buys spare ${good} for about ${floor} coins, and always sells imported ${good} for about ${ceiling} coins (its own price is ${round(world)}, the grey line). So the valley's price stays between ${floor} and ${ceiling}.`,
    `When the valley makes more ${good} than it uses, the extra is sold to the outside world and the price sinks to the bottom (about ${floor}). When the valley runs short, people have to import and the price climbs toward the top (about ${ceiling}).`,
    "Each shift one auction sets one price for everybody. If nobody trades that shift, the line just keeps the last price, so it goes flat.",
  ];
}

function metalRules(good: "copper" | "gold", c: Ctx): string[] {
  const n = good === "gold" ? Math.max(1, Math.round(DEPTH(c) / 4)) : DEPTH(c);
  return [
    `The outside world buys all the ${good} the valley sells, but on a staircase: ${STAIRS.replaceAll("{n}", String(n))}. Its full price right now is ${round(c.m.worldPrices[good])}.`,
    `So selling a lot of ${good} in one shift drags the price down for everyone, and selling a little keeps it near the full price. Nobody inside the valley uses ${good}, so the outside world is the only buyer.`,
    "The outside world's own price wanders slowly up and down by itself, and a price shock from the Overseer can jump it.",
  ];
}

export const CHARTS: Record<string, ChartSpec> = {
  "food-price": {
    title: "Food price",
    format: "coins",
    lines: [{ label: "Valley food price", get: (m) => m.prices.food }, { label: "Outside world food price", get: (m) => m.worldPrices.food }],
    drivers: [act("farm", "Miners farming"), { label: "Food grown", get: (m) => m.output.food }, { label: "Food eaten", get: (m) => m.consumed.food }, { label: "Food imported", get: (m) => m.imports.food }, { label: "Food sold to the outside", get: (m) => m.exports.food }, { label: "Share of miners hungry", get: (m) => m.hungryFrac, format: "share" }],
    about: (c) => ["This is what one unit of food sold for in the valley each shift. Farmers sell it, and everyone has to eat.", ...stapleRules("food", c)],
    topics: ["foodPrice", "foodOutput", "farming", "hungry"],
    limits: stapleLimits("food"),
  },
  "timber-price": {
    title: "Timber price",
    format: "coins",
    lines: [{ label: "Valley timber price", get: (m) => m.prices.timber }, { label: "Outside world timber price", get: (m) => m.worldPrices.timber }],
    drivers: [act("chop", "Miners chopping"), act("build", "Miners building"), { label: "Timber cut", get: (m) => m.output.timber }, { label: "Timber used", get: (m) => m.consumed.timber }, { label: "Timber imported", get: (m) => m.imports.timber }, { label: "Forest left", get: (m) => m.forestFraction, format: "share" }],
    about: (c) => ["This is what one unit of timber sold for in the valley each shift. Choppers cut it in the forest, and builders need it to put up houses.", ...stapleRules("timber", c)],
    topics: ["timberPrice", "timberOutput", "chopping", "forest"],
    limits: stapleLimits("timber"),
  },
  "copper-price": {
    title: "Copper and ore prices",
    format: "coins",
    lines: [{ label: "Copper price", get: (m) => m.prices.copper }, { label: "Ore price", get: (m) => m.prices.copperOre }],
    drivers: [act("dig", "Miners digging"), act("smelt", "Miners smelting"), { label: "Ore dug", get: (m) => m.output.copperOre }, { label: "Copper made", get: (m) => m.output.copper }, { label: "Copper sold", get: (m) => m.volume.copper }, { label: "Outside world copper price", get: (m) => m.worldPrices.copper, format: "coins" }],
    about: (c) => [
      "Miners dig copper ore at the mine, and the smelter turns ore into copper. These lines are what a unit of copper and a unit of raw ore sold for each shift.",
      ...metalRules("copper", c),
      `Raw ore is worth much less: the outside world buys any amount of it at a flat ${Math.max(1, Math.floor(c.m.worldPrices.copperOre))} coins, so the ore line barely moves.`,
    ],
    topics: ["copperPrice", "copperSold", "oreOutput", "digging"],
  },
  "gold-price": {
    title: "Gold price",
    format: "coins",
    lines: [{ label: "Valley gold price", get: (m) => m.prices.gold }, { label: "Outside world gold price", get: (m) => m.worldPrices.gold }],
    drivers: [act("dig", "Miners digging"), { label: "Gold dug", get: (m) => m.output.gold }, { label: "Gold sold", get: (m) => m.volume.gold }],
    about: (c) => ["Gold is rare: a few lucky diggers find a little of it. This is what a unit of gold sold for each shift.", ...metalRules("gold", c)],
    topics: ["goldPrice", "goldSold", "goldOutput"],
  },
  volume: {
    title: "Units traded per shift",
    format: "count",
    lines: [
      { label: "Food traded", get: (m) => m.volume.food }, { label: "Timber traded", get: (m) => m.volume.timber }, { label: "Ore traded", get: (m) => m.volume.copperOre },
      { label: "Copper traded", get: (m) => m.volume.copper }, { label: "Gold traded", get: (m) => m.volume.gold },
    ],
    drivers: [act("farm", "Miners farming"), act("chop", "Miners chopping"), act("dig", "Miners digging"), act("smelt", "Miners smelting")],
    about: () => [
      "How many units of each good changed hands in the valley's market each shift, including sales to and purchases from the outside world.",
      "More people making a good usually means more of it gets sold. Food trades a lot because everyone eats; gold trades little because there is little of it.",
    ],
    topics: ["copperSold", "goldSold"],
  },
  wellbeing: {
    title: "Average well-being",
    format: "number",
    lines: [{ label: "Average well-being", get: (m) => m.meanWellbeing }],
    drivers: [{ label: "Share of miners hungry", get: (m) => m.hungryFrac, format: "share" }, { label: "Share sleeping rough", get: (m) => m.roughSleepersFrac, format: "share" }, { label: "Share injured", get: (m) => m.injuredFrac, format: "share" }, { label: "Share in their own house", get: (m) => m.housedFrac, format: "share" }, { label: "Coins held by miners", get: (m) => m.money.miners, format: "coins" }],
    about: () => [
      "Every miner has one happiness score, roughly from 0 (miserable) to 1 (every need met). This line is the average across the valley.",
      "The score comes from six needs: enough food, rest, a roof over their head, health, feeling safe, and a few comforts. Being hungry or sleeping outside hurts it the most.",
      "Each miner chooses what to do each shift to push their own score up, so this line is the result of everyone's choices together.",
    ],
    topics: ["wellbeing", "hungry", "roughSleepers"],
  },
  hardship: {
    title: "Hardship",
    format: "share",
    lines: [{ label: "Hungry", get: (m) => m.hungryFrac }, { label: "Sleeping rough", get: (m) => m.roughSleepersFrac }, { label: "Injured", get: (m) => m.injuredFrac }],
    drivers: [{ label: "Food price", get: (m) => m.prices.food, format: "coins" }, { label: "Food grown", get: (m) => m.output.food }, { label: "Coins held by miners", get: (m) => m.money.miners, format: "coins" }, { label: "Share in their own house", get: (m) => m.housedFrac, format: "share" }],
    about: () => [
      "The share of miners who are hungry, sleeping outside, or hurt.",
      "Hunger rises when food is scarce or too expensive for poorer miners. Sleeping rough happens when a miner has no house and can't pay the bunkhouse. Injuries mostly come from cave-ins in the mines and from the Overseer's lightning.",
      "The town's soup kitchen hands out food to the hungry, so hunger usually doesn't last long.",
    ],
    topics: ["hungry", "roughSleepers"],
  },
  homes: {
    title: "Homes",
    format: "share",
    lines: [{ label: "Share in their own house", get: (m) => m.housedFrac }],
    drivers: [act("build", "Miners building"), { label: "Timber price", get: (m) => m.prices.timber, format: "coins" }, { label: "Coins held by miners", get: (m) => m.money.miners, format: "coins" }, { label: "Money owed to the bank", get: (m) => m.debt.total, format: "coins" }],
    about: () => [
      "The share of miners who live in a house they own.",
      "To get a house, a miner needs enough savings (or a bank loan) to pay for the timber and the builders' work, and then it takes a few shifts to build. Everyone else rents a bunk or sleeps outside.",
      "Houses last, so this line almost never goes down. It steps up each time a house is finished and stays flat in between.",
    ],
    topics: ["roughSleepers"],
  },
  gini: {
    title: "Inequality (Gini)",
    format: "number",
    lines: [{ label: "Inequality (Gini)", get: (m) => m.gini }],
    drivers: [{ label: "Coins held by miners", get: (m) => m.money.miners, format: "coins" }, { label: "Miners in hired jobs", get: (m) => m.employed }, { label: "Coins in the treasury", get: (m) => m.money.treasury, format: "coins" }],
    about: () => [
      "A single number for how unevenly money is spread: 0 means everyone has the same, 1 means one miner has everything.",
      "It rises when a few miners earn much more than the rest (lucky gold finds, owning a business that hires others) and falls when the town's taxes and the soup kitchen share money back out.",
    ],
    topics: ["gini"],
  },
  money: {
    title: "Where the money is",
    format: "coins",
    lines: [{ label: "Held by miners", get: (m) => m.money.miners }, { label: "Held by the bank", get: (m) => m.money.bank }, { label: "Held by the town treasury", get: (m) => m.money.treasury }, { label: "Total in the valley", get: (m) => m.money.total }],
    drivers: [{ label: "Coins earned from exports", get: (m) => m.money.exportRevenue }, { label: "Coins paid for imports", get: (m) => m.money.importSpend }, { label: "Coins spent on comforts", get: (m) => m.money.comfortSpend }],
    about: () => [
      "All the coins in the valley, stacked by who holds them: the miners, the bank, and the town treasury.",
      "Coins only come into the valley when the outside world buys something (mostly copper and gold) or the Overseer grants a boon. They leave when the valley imports goods or miners buy comforts from outside.",
      "Moving coins between miners, the bank and the treasury (wages, rent, taxes, loans) changes the colours but not the total height.",
    ],
    topics: ["money", "debt"],
  },
  debt: {
    title: "Debt",
    format: "coins",
    lines: [{ label: "Owed to the bank", get: (m) => m.debt.total }],
    drivers: [{ label: "New loans this shift", get: (m) => m.debt.issuedToday, format: "count" }, { label: "Loans defaulted this shift", get: (m) => m.debt.defaultsToday, format: "count" }, { label: "Bank interest rate (% per day)", get: (m) => m.debt.ratePerDay * 100, format: "number" }, { label: "Coins held by the bank", get: (m) => m.money.bank, format: "coins" }, act("build", "Miners building")],
    about: () => [
      "The total that miners (and the town) owe the bank.",
      "It goes up when people borrow, mostly to build houses or to get through a bad patch, and down as loans are repaid or written off when someone can't pay.",
      "If the bank's own savings run too low it stops lending (a credit freeze), and then debt can only fall.",
    ],
    topics: ["debt", "bankRate"],
  },
  flows: {
    title: "Money in and out of the valley",
    format: "coins",
    lines: [{ label: "Exports earned", get: (m) => m.money.exportRevenue }, { label: "Imports paid", get: (m) => m.money.importSpend }, { label: "Comforts bought", get: (m) => m.money.comfortSpend }],
    drivers: [{ label: "Copper sold", get: (m) => m.volume.copper }, { label: "Gold sold", get: (m) => m.volume.gold }, { label: "Copper price", get: (m) => m.prices.copper, format: "coins" }, { label: "Gold price", get: (m) => m.prices.gold, format: "coins" }, { label: "Food imported", get: (m) => m.imports.food }],
    about: () => [
      "Coins crossing the valley's border each shift. Green is money coming in from selling to the outside world, red is money going out to pay for imports, and purple is money miners spend on comforts from outside.",
      "When green is above red and purple, the valley is getting richer. Most income comes from copper and gold, so it jumps around with how much metal was sold.",
    ],
    topics: ["money", "copperSold", "goldSold"],
  },
  activity: {
    title: "What the town is doing",
    format: "count",
    lines: [act("dig", "Digging"), act("farm", "Farming"), act("chop", "Chopping"), act("smelt", "Smelting"), act("build", "Building"), act("work", "Hired work"), act("rest", "Resting")],
    drivers: [{ label: "Food price", get: (m) => m.prices.food, format: "coins" }, { label: "Timber price", get: (m) => m.prices.timber, format: "coins" }, { label: "Copper price", get: (m) => m.prices.copper, format: "coins" }, { label: "Gold price", get: (m) => m.prices.gold, format: "coins" }, { label: "Share of miners hungry", get: (m) => m.hungryFrac, format: "share" }],
    about: () => [
      "How many miners did each kind of work each shift.",
      "Each miner picks the job that looks best for them: when a good's price goes up, making it pays more, so more miners switch to it. Tired or hurt miners rest.",
      "Miners have habits, so they don't all switch at once. That's why the bands shift gradually instead of jumping.",
    ],
    topics: ["digging", "farming", "chopping"],
  },
  output: {
    title: "Produced per shift",
    format: "count",
    lines: [{ label: "Food grown", get: (m) => m.output.food }, { label: "Timber cut", get: (m) => m.output.timber }, { label: "Ore dug", get: (m) => m.output.copperOre }, { label: "Copper made", get: (m) => m.output.copper }],
    drivers: [act("farm", "Miners farming"), act("chop", "Miners chopping"), act("dig", "Miners digging"), act("smelt", "Miners smelting"), { label: "Forest left", get: (m) => m.forestFraction, format: "share" }],
    about: () => [
      "How much of each good the valley made each shift.",
      "Output mostly follows how many miners are doing that job. Nature matters too: a drought shrinks harvests, a thin forest gives less timber per chop, and a worked-out vein gives less ore.",
    ],
    topics: ["foodOutput", "timberOutput", "oreOutput"],
  },
  "gold-output": {
    title: "Gold dug per shift",
    format: "number",
    lines: [{ label: "Gold dug", get: (m) => m.output.gold }],
    drivers: [act("dig", "Miners digging"), { label: "Gold price", get: (m) => m.prices.gold, format: "coins" }],
    about: () => [
      "How much gold the diggers found each shift.",
      "Gold is rare, so this is usually small and spiky. A gold rush from the Overseer makes a vein much richer for a while and pulls diggers to it.",
    ],
    topics: ["goldOutput"],
  },
  forest: {
    title: "Forest left",
    format: "share",
    lines: [{ label: "Forest left standing", get: (m) => m.forestFraction }],
    drivers: [act("chop", "Miners chopping"), { label: "Timber cut", get: (m) => m.output.timber }, { label: "Timber price", get: (m) => m.prices.timber, format: "coins" }],
    about: () => [
      "How much of the forest is still standing, compared with the start.",
      "Chopping cuts it down and it grows back on its own: fastest when about half the forest is left, slowly when it is almost bare. The thinner the forest, the less timber each chop gives.",
    ],
    topics: ["forest", "timberOutput", "chopping"],
  },
};

/** Events that can explain a chart, worth naming one by one. */
const KEY_EVENTS = new Set(["act-of-god", "god-power", "dial-changed", "credit-freeze", "credit-thaw", "vein-exhausted", "forest-depleted"]);
/** Events that are only worth counting. */
const COUNTED: Record<string, string> = { "house-complete": "houses were finished", "loan-default": "loans went unpaid", collapse: "miners collapsed from hunger or injury", "cave-in": "cave-ins happened" };

const HISTORY = 300;

export interface ExplainOptions {
  dials: Record<string, number>;
  /** Narrator cards so far; the ones about this chart are quoted as facts. */
  cards?: Card[];
  llm?: LlmClient;
  timeoutMs?: number;
  onProblem?: (message: string) => void;
}

/** Keeps the recent history the dashboard shows, and explains any of its charts on request. */
export class ChartExplainer {
  private metrics: ShiftMetrics[] = [];
  private events: SimEvent[] = [];
  private cache = new Map<string, Promise<ChartExplanation>>();

  push(record: ShiftRecord): void {
    this.metrics.push(record.metrics);
    if (this.metrics.length > HISTORY) this.metrics.shift();
    for (const e of record.events) if (KEY_EVENTS.has(e.kind) || COUNTED[e.kind]) this.events.push(e);
    const first = this.metrics[0]?.shift ?? 0;
    if (this.events.length && this.events[0].shift < first) this.events = this.events.filter((e) => e.shift >= first);
  }

  rewind(shift: number): void {
    this.metrics = this.metrics.filter((m) => m.shift <= shift);
    this.events = this.events.filter((e) => e.shift <= shift);
    this.cache.clear();
  }

  /** Same chart, same shift: the same answer, without asking the model twice. */
  explain(chart: string, opts: ExplainOptions): Promise<ChartExplanation> {
    const spec = CHARTS[chart];
    if (!spec) return Promise.reject(new Error(`unknown chart "${chart}"`));
    const key = `${chart}@${this.metrics.at(-1)?.shift ?? -1}`;
    let p = this.cache.get(key);
    if (!p) {
      p = explainChart(chart, spec, [...this.metrics], [...this.events], opts);
      this.cache.set(key, p);
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      p.catch(() => this.cache.delete(key));
    }
    return p;
  }
}

// ---------------------------------------------------------------- facts

export interface ChartFacts {
  /** Everything the model may use, one fact per line. */
  lines: string[];
  template: Omit<ChartExplanation, "writtenBy">;
}

export function chartFacts(chart: string, spec: ChartSpec, ms: ShiftMetrics[], events: SimEvent[], opts: Pick<ExplainOptions, "dials" | "cards">): ChartFacts {
  const last = ms[ms.length - 1];
  const from = ms[0]?.shift ?? 0;
  const to = last?.shift ?? 0;
  const about = last ? spec.about({ m: last, dials: opts.dials }) : [];
  const base = { chart, title: spec.title, fromShift: from, toShift: to };

  if (ms.length < 4) {
    const text = `The valley has only run ${ms.length} shift${ms.length === 1 ? "" : "s"} so far, so there is no shape to explain yet. Let it run a little longer.`;
    return { lines: [...about, text], template: { ...base, whatItShows: about.slice(0, 2).join(" "), whatHappened: text, why: [] } };
  }

  const xs = ms.map((m) => m.shift);
  const lines: string[] = [`CHART: "${spec.title}", shifts ${from} to ${to}.`, "WHAT IT IS AND THE RULES BEHIND IT:", ...about.map((a) => `- ${a}`), "HOW THE LINES MOVED:"];
  const described = spec.lines.map((l) => describe(l.label, xs, ms.map(l.get), l.format ?? spec.format));
  for (const d of described) lines.push(...d.facts.map((f) => `- ${f}`));

  const main = described[0];
  if (spec.limits) {
    const ys = ms.map(spec.lines[0].get);
    let atFloor = 0, atCeiling = 0;
    ms.forEach((m, i) => {
      const [f, c] = spec.limits!(m, opts.dials);
      if (ys[i] <= f + 1) atFloor++;
      else if (ys[i] >= c - 2) atCeiling++;
    });
    lines.push(`- ${main.label} sat at the bottom limit (outside world buying the extra) in ${atFloor} of ${ms.length} shifts, and at the top limit (valley importing) in ${atCeiling} shifts.`);
  }
  lines.push("WHAT ELSE CHANGED (average over the first quarter vs the last quarter of the chart):");
  for (const d of spec.drivers) {
    const ys = ms.map(d.get);
    const q = Math.max(1, Math.floor(ys.length / 4));
    lines.push(`- ${d.label}: ${fmt(avg(ys.slice(0, q)), d.format ?? "count")} then ${fmt(avg(ys.slice(-q)), d.format ?? "count")}`);
  }

  // Around each big move: what the drivers did, and what happened in the world.
  const moveWhy: string[] = [];
  if (main.moves.length) lines.push("AROUND EACH BIG MOVE (3 shifts before vs 3 shifts after):");
  for (const mv of main.moves) {
    const i0 = xs.indexOf(mv.start), i1 = xs.indexOf(mv.end);
    const changes = spec.drivers
      .map((d) => {
        const ys = ms.map(d.get);
        const before = avg(ys.slice(Math.max(0, i0 - 3), i0 + 1));
        const after = avg(ys.slice(i1, i1 + 4));
        const rel = Math.abs(after - before) / Math.max(Math.abs(before), Math.abs(after), 1e-9);
        return { d, before, after, rel };
      })
      .filter((c) => c.rel >= 0.15 && fmt(c.before, c.d.format ?? "count") !== fmt(c.after, c.d.format ?? "count"))
      .sort((a, b) => b.rel - a.rel);
    const near = events.filter((e) => KEY_EVENTS.has(e.kind) && e.shift >= mv.start - 4 && e.shift <= mv.end + 1).map(eventText);
    const head = `${main.label} ${mv.to > mv.from ? "rose" : "fell"} from ${fmt(mv.from, main.format)} to ${fmt(mv.to, main.format)} ${span(mv.start, mv.end)}`;
    lines.push(`- ${head}.`);
    for (const n of near) lines.push(`  - world event: ${n}`);
    for (const c of changes.slice(0, 4)) lines.push(`  - ${c.d.label} went from ${fmt(c.before, c.d.format ?? "count")} to ${fmt(c.after, c.d.format ?? "count")}`);
    const said = [...near, ...changes.slice(0, 2).map((c) => `${lower(c.d.label)} went from ${fmt(c.before, c.d.format ?? "count")} to ${fmt(c.after, c.d.format ?? "count")}`)];
    moveWhy.push(said.length ? `${head}. At the same time, ${said.join("; ")}.` : `${head}, with no world event or other big change at the same time, so it was probably the market's normal ups and downs.`);
  }

  const key = events.filter((e) => KEY_EVENTS.has(e.kind));
  if (key.length) {
    lines.push("THINGS THAT HAPPENED IN THE WORLD DURING THE CHART:");
    for (const e of key.slice(-12)) lines.push(`- ${eventText(e)}`);
  }
  const counts = new Map<string, number>();
  for (const e of events) if (COUNTED[e.kind]) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  for (const [k, n] of counts) lines.push(`- Over the chart, ${n} ${COUNTED[k]}.`);

  const cards = (opts.cards ?? []).filter((c) => spec.topics.includes(c.topic) && c.round >= from && c.round <= to).slice(-4);
  if (cards.length) {
    lines.push("WHAT THE NARRATOR NOTICED (already checked against the data):");
    for (const c of cards) lines.push(`- At shift ${c.round}: ${[c.headline, ...c.statements.map((s) => s.text)].join(" ")}`);
  }

  const whatHappened = [main.summary, main.flats[0] ? `It stayed flat at ${fmt(main.flats[0].value, main.format)} ${span(main.flats[0].start, main.flats[0].end)}.` : ""].filter(Boolean).join(" ");
  const why = [...about.slice(1, 3), ...moveWhy.slice(0, 3)];
  return { lines, template: { ...base, whatItShows: about[0], whatHappened, why } };
}

interface Move { start: number; end: number; from: number; to: number }
interface Flat { start: number; end: number; value: number }

/** The shape of one line: start, end, range, flat stretches and the biggest moves, as facts. */
export function describe(label: string, xs: number[], ys: number[], format: Fmt) {
  const n = ys.length;
  let lo = 0, hi = 0;
  for (let i = 1; i < n; i++) {
    if (ys[i] < ys[lo]) lo = i;
    if (ys[i] > ys[hi]) hi = i;
  }
  const range = ys[hi] - ys[lo];
  const facts: string[] = [];
  const summary = range < 1e-9
    ? `${label} stayed at ${fmt(ys[0], format)} the whole time.`
    : `${label} started at ${fmt(ys[0], format)} and ended at ${fmt(ys[n - 1], format)}. Its lowest was ${fmt(ys[lo], format)} (shift ${xs[lo]}) and its highest ${fmt(ys[hi], format)} (shift ${xs[hi]}).`;
  facts.push(summary);
  if (range < 1e-9) return { label, format, facts, summary, flats: [] as Flat[], moves: [] as Move[] };

  // Quarters show the overall trend.
  const q = Math.max(1, Math.floor(n / 4));
  const parts: string[] = [];
  for (let k = 0; k < 4 && k * q < n; k++) {
    const a = k * q, b = k === 3 ? n : Math.min(n, (k + 1) * q);
    parts.push(`${span(xs[a], xs[b - 1])} about ${fmt(avg(ys.slice(a, b)), format)}`);
  }
  facts.push(`${label}, averaged by quarter: ${parts.join("; ")}.`);

  // Flat stretches: the value barely moved for a while.
  const tol = range * 0.02;
  const flats: Flat[] = [];
  let s = 0;
  for (let i = 1; i <= n; i++) {
    if (i < n && Math.abs(ys[i] - ys[s]) <= tol) continue;
    if (i - s >= Math.max(5, Math.floor(n / 10))) flats.push({ start: xs[s], end: xs[i - 1], value: ys[s] });
    s = i;
  }
  flats.sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const f of flats.slice(0, 3)) facts.push(`${label} was flat at ${fmt(f.value, format)} ${span(f.start, f.end)}.`);

  // Big moves: runs of same-direction steps that add up to a big share of the range.
  const moves: Move[] = [];
  let i = 1;
  while (i < n) {
    const dir = Math.sign(ys[i] - ys[i - 1]);
    if (dir === 0) { i++; continue; }
    let j = i;
    while (j + 1 < n && Math.sign(ys[j + 1] - ys[j]) === dir) j++;
    if (Math.abs(ys[j] - ys[i - 1]) >= range * 0.3) moves.push({ start: xs[i - 1], end: xs[j], from: ys[i - 1], to: ys[j] });
    i = j + 1;
  }
  moves.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  const top = moves.slice(0, 4).sort((a, b) => a.start - b.start);
  for (const m of top) facts.push(`${label} ${m.to > m.from ? "rose" : "fell"} from ${fmt(m.from, format)} to ${fmt(m.to, format)} ${span(m.start, m.end)}.`);
  const swings = moves.length;
  if (swings > 8) facts.push(`${label} jumped up and down a lot (${swings} big swings), so the shift-to-shift wiggle is mostly noise.`);
  return { label, format, facts, summary, flats, moves: top };
}

function eventText(e: SimEvent): string {
  const at = `at shift ${e.shift}`;
  const d = e.data ?? {};
  switch (e.kind) {
    case "act-of-god":
      switch (d.act) {
        case "goldRush": return `${at}, a gold rush began (the Overseer made a gold vein much richer)`;
        case "earthquake": return `${at}, an earthquake struck, making cave-ins more likely`;
        case "drought": return `${at}, a drought began, shrinking farm harvests`;
        case "forestFire": return `${at}, a forest fire burned part of the forest`;
        case "priceShock": return `${at}, a price shock moved the outside world's ${e.good ?? "metal"} price from ${d.from} to ${d.to}`;
        default: return `${at}, ${e.text ?? "an act of god"}`;
      }
    case "god-power":
      if (d.power === "boon") return `${at}, the Overseer gave one miner a windfall of ${d.amount} coins`;
      if (d.power === "lightning") return `${at}, the Overseer struck a miner with lightning`;
      return `${at}, the Overseer threw a miner into the river`;
    case "dial-changed": return `${at}, the Overseer changed the "${dialName(String(d.key))}" setting from ${d.from} to ${d.to}`;
    case "credit-freeze": return `${at}, the bank ran low on savings and stopped lending (credit freeze)`;
    case "credit-thaw": return `${at}, the bank started lending again`;
    case "vein-exhausted": return `${at}, a mine vein was worked out`;
    case "forest-depleted": return `${at}, the forest was stripped nearly bare`;
    default: return `${at}, ${e.text ?? e.kind}`;
  }
}

const DIAL_NAMES: Record<string, string> = {
  caveInRisk: "cave-in risk", farmYield: "farm yield", chopYield: "chop yield", digYield: "dig yield", goldYield: "gold yield",
  interestRate: "interest rate", importMarkup: "import markup", exportDepth: "export market depth", worldFoodPrice: "world food price",
  worldTimberPrice: "world timber price", worldCopperPrice: "world copper price", worldGoldPrice: "world gold price",
  bunkhouseRent: "bunkhouse rent", reliefRations: "soup kitchen rations",
};
const dialName = (k: string) => DIAL_NAMES[k] ?? k.replace(/([A-Z])/g, " $1").toLowerCase();

// ---------------------------------------------------------------- wording

async function explainChart(chart: string, spec: ChartSpec, ms: ShiftMetrics[], events: SimEvent[], opts: ExplainOptions): Promise<ChartExplanation> {
  const facts = chartFacts(chart, spec, ms, events, opts);
  const fallback: ChartExplanation = { ...facts.template, writtenBy: "template" };
  if (!opts.llm || ms.length < 4) return fallback;
  const res = await wordWithModel(facts, opts.llm, opts.timeoutMs ?? 25_000);
  if (!res.ok) {
    opts.onProblem?.(`chart "${chart}": ${res.problems.join("; ")}`);
    return fallback;
  }
  return { ...facts.template, ...res.words, writtenBy: "llm" };
}

type Words = Pick<ChartExplanation, "whatItShows" | "whatHappened" | "why">;

export async function wordWithModel(facts: ChartFacts, client: LlmClient, timeoutMs: number): Promise<{ ok: true; words: Words } | { ok: false; problems: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let raw: string;
  try {
    raw = await client.generate(chartPrompt(facts.lines), controller.signal);
  } catch (e) {
    return { ok: false, problems: [controller.signal.aborted ? "timed out" : `model error: ${String(e)}`] };
  } finally {
    clearTimeout(timer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return { ok: false, problems: ["reply was not JSON"] };
  }
  const o = parsed as Partial<Words>;
  if (typeof o?.whatItShows !== "string" || typeof o.whatHappened !== "string" || !Array.isArray(o.why) || !o.why.every((w) => typeof w === "string") || !o.why.length) {
    return { ok: false, problems: ["reply had the wrong shape"] };
  }
  const words: Words = { whatItShows: o.whatItShows.trim(), whatHappened: o.whatHappened.trim(), why: o.why.map((w) => w.trim()).filter(Boolean).slice(0, 6) };
  const problems = checkNumbers([words.whatItShows, words.whatHappened, ...words.why].join(" "), facts.lines.join("\n"));
  return problems.length ? { ok: false, problems } : { ok: true, words };
}

/** Every number in the explanation must be one that's in the facts (small counting words aside). */
export function checkNumbers(text: string, facts: string): string[] {
  const allowed = new Set(numbersIn(facts));
  const bad = numbersIn(text).filter((n) => n > 4 && !allowed.has(n));
  return bad.length ? [`numbers not in the facts: ${[...new Set(bad)].join(", ")}`] : [];
}

function numbersIn(s: string): number[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((t) => Number(t.replace(/,/g, "")));
}

export function chartPrompt(facts: string[]): string {
  return `You explain one chart from a simulated mining valley to someone with no economics background. Think of a curious 12-year-old.

Use ONLY the facts below. They were measured from the simulation and its actual rules.

Write:
- "whatItShows": 1-2 short sentences. What is this chart, in everyday words?
- "whatHappened": 2-3 short sentences. How did the line move over time? Name the flat parts and the big jumps, with shift numbers.
- "why": 2-5 short lines, each one cause and effect, like "Fewer people farmed, so less food was grown, so food got scarce and the price went up." Use the rules in the facts to explain the shape (for example why a price sits flat at a floor or ceiling).

Rules:
- Plain, friendly words. No jargon: say "price limit" not "price ceiling arbitrage", "money" not "liquidity".
- Every number you write must appear in the facts exactly. Don't calculate new numbers. You may leave numbers out.
- Don't invent causes. If something only happened at the same time, say "probably" or "seems to". If the facts show no clear cause for a wiggle, say it's the market's normal ups and downs.
- Talk about "miners", "the valley", "the outside world" and "the Overseer" (the person playing), as the facts do.

Return only JSON: {"whatItShows": string, "whatHappened": string, "why": [string, ...]}

FACTS:
${facts.join("\n")}`;
}

// ---------------------------------------------------------------- helpers

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function round(v: number): number {
  return Math.round(v);
}

function fmt(v: number, f: Fmt): string {
  switch (f) {
    case "coins": return Math.abs(v) >= 10_000 ? `${(v / 1000).toFixed(0)}k coins` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k coins` : `${Math.round(v)} coins`;
    case "share": return `${Math.round(v * 100)}%`;
    case "number": return v.toFixed(2);
    case "count": return Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  }
}

function span(a: number, b: number): string {
  return a === b ? `at shift ${a}` : `from shift ${a} to ${b}`;
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
