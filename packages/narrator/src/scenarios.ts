// Scripted fake worlds with planted causes, so we can check the narrator
// against a known truth before the real sim exists. This is test and demo data,
// not a model of the economy: each scenario just bends one metric on purpose.

import {
  CONFIDENCE_SCALE,
  type Card,
  type Confidence,
  type Direction,
  type KnownEffect,
  type KnownLink,
  type NarratorConfig,
  type RoundSnapshot,
  type WorldEvent,
} from "./types.js";
import type { Narrator } from "./narrator.js";

export interface ScenarioTruth {
  metric: string;
  direction: Direction;
  /** Events the card may name as its cause. Empty: the planted change has no recorded cause. */
  acceptableCauses: string[];
  confidence: Confidence;
  /** The shift the planted change begins. */
  changeStarts: number;
  /** For a chain: the in-between metric the card must trace through. */
  via?: string;
  /** Other metrics that are meant to change too (not false alarms). */
  alsoChanges?: string[];
}

export interface Scenario {
  name: string;
  description: string;
  config: NarratorConfig;
  history: RoundSnapshot[];
  /** null: nothing should be reported. */
  truth: ScenarioTruth | null;
}

const ROUNDS = 40;

const BASELINES: Record<string, { usual: number; noise: number }> = {
  goldPrice: { usual: 12, noise: 0.3 },
  copperPrice: { usual: 5, noise: 0.12 },
  shareMining: { usual: 0.6, noise: 0.015 },
  shareStarving: { usual: 0.05, noise: 0.004 },
};

const BASE_CONFIG: NarratorConfig = {
  metrics: {
    goldPrice: { label: "the gold price", format: "coins" },
    copperPrice: { label: "the copper price", format: "coins" },
    shareMining: { label: "the share of miners working the mines", format: "share" },
    shareStarving: { label: "the share of miners going hungry", format: "share" },
  },
  eventLabels: { goldRush: "gold rush", earthquake: "earthquake", caveIn: "cave-in", lightning: "lightning strike" },
};

interface Plan {
  name: string;
  description: string;
  events: WorldEvent[];
  /** Relative changes to metrics, each ramping in over 4 shifts from `from`. */
  effects?: { metric: string; from: number; change: number }[];
  knownEffects?: KnownEffect[];
  knownLinks?: KnownLink[];
  truth: ScenarioTruth | null;
}

const PLANS: Plan[] = [
  {
    name: "gold-rush",
    description: "The Overseer starts a gold rush at shift 20; the gold price falls 30% from shift 21.",
    events: [{ kind: "goldRush", round: 20, source: "overseer" }],
    effects: [{ metric: "goldPrice", from: 21, change: -0.3 }],
    knownEffects: [{ event: "goldRush", metric: "goldPrice", direction: "down" }],
    truth: { metric: "goldPrice", direction: "down", acceptableCauses: ["goldRush"], confidence: "likely", changeStarts: 21 },
  },
  {
    name: "two-suspects",
    description: "An earthquake (shift 19) and a cave-in (shift 20), both known to cut mining, then mining drops.",
    events: [
      { kind: "earthquake", round: 19, source: "world" },
      { kind: "caveIn", round: 20, source: "world" },
    ],
    effects: [{ metric: "shareMining", from: 21, change: -0.25 }],
    knownEffects: [
      { event: "earthquake", metric: "shareMining", direction: "down" },
      { event: "caveIn", metric: "shareMining", direction: "down" },
    ],
    truth: { metric: "shareMining", direction: "down", acceptableCauses: ["earthquake", "caveIn"], confidence: "possibly", changeStarts: 21 },
  },
  {
    name: "coincidence",
    description: "A lightning strike at shift 21 that is NOT known to affect hunger, and hunger rises from shift 22 anyway.",
    events: [{ kind: "lightning", round: 21, source: "overseer" }],
    effects: [{ metric: "shareStarving", from: 22, change: 0.6 }],
    truth: { metric: "shareStarving", direction: "up", acceptableCauses: ["lightning"], confidence: "possibly", changeStarts: 22 },
  },
  {
    name: "unexplained",
    description: "The copper price rises from shift 22 with nothing recorded before it.",
    events: [],
    effects: [{ metric: "copperPrice", from: 22, change: 0.25 }],
    truth: { metric: "copperPrice", direction: "up", acceptableCauses: [], confidence: "unclear", changeStarts: 22 },
  },
  {
    name: "chain",
    description: "A gold rush at shift 20 pulls more miners into the mines (from shift 21), and the extra gold then lowers the gold price (from shift 23).",
    events: [{ kind: "goldRush", round: 20, source: "overseer" }],
    effects: [
      { metric: "shareMining", from: 21, change: 0.25 },
      { metric: "goldPrice", from: 23, change: -0.3 },
    ],
    knownEffects: [{ event: "goldRush", metric: "shareMining", direction: "up" }],
    knownLinks: [{ from: "shareMining", fromDirection: "up", to: "goldPrice", direction: "down" }],
    truth: {
      metric: "goldPrice",
      direction: "down",
      acceptableCauses: ["goldRush"],
      confidence: "likely",
      changeStarts: 23,
      via: "shareMining",
      alsoChanges: ["shareMining"],
    },
  },
  {
    name: "quiet",
    description: "Only normal ups and downs. The narrator should say nothing.",
    events: [],
    truth: null,
  },
];

export const SCENARIO_NAMES = PLANS.map((p) => p.name);

export function makeScenario(name: string, seed = "demo"): Scenario {
  const plan = PLANS.find((p) => p.name === name);
  if (!plan) throw new Error(`Unknown scenario "${name}". Try: ${SCENARIO_NAMES.join(", ")}`);
  const rand = gaussian(seededRandom(`${seed}:${name}`));

  const history: RoundSnapshot[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const metrics: Record<string, number> = {};
    for (const [metric, { usual, noise }] of Object.entries(BASELINES)) {
      let value = usual;
      for (const e of plan.effects ?? []) {
        if (e.metric === metric && round >= e.from) value *= 1 + e.change * Math.min(1, (round - e.from + 1) / 4);
      }
      metrics[metric] = value + rand() * noise;
    }
    history.push({ round, metrics, events: plan.events.filter((e) => e.round === round) });
  }

  return {
    name: plan.name,
    description: plan.description,
    config: { ...BASE_CONFIG, knownEffects: plan.knownEffects ?? [], knownLinks: plan.knownLinks ?? [] },
    history,
    truth: plan.truth,
  };
}

/** Feeds the scenario to the narrator one shift at a time, like the live server will. */
export async function playScenario(scenario: Scenario, narrator: Narrator): Promise<Card[]> {
  const cards: Card[] = [];
  for (let i = 1; i <= scenario.history.length; i++) {
    cards.push(...(await narrator.step(scenario.history.slice(0, i))));
  }
  return cards;
}

/**
 * right:        first card on the planted metric has the right direction, start (±1 shift),
 *               confidence, and names exactly the acceptable causes
 * overclaimed:  any card on the planted metric sounds more sure than the truth allows
 * false alarms: cards on metrics nothing was planted on
 */
export function scoreScenario(scenario: Scenario, cards: Card[]) {
  const truth = scenario.truth;
  const expected = truth ? [truth.metric, ...(truth.alsoChanges ?? [])] : [];
  const falseAlarms = cards.filter((c) => !expected.includes(c.topic)).length;
  if (!truth) return { verdict: falseAlarms ? ("wrong" as const) : ("right" as const), overclaimed: false, falseAlarms };

  const onTopic = cards.filter((c) => c.topic === truth.metric);
  const rank = (c: Confidence) => CONFIDENCE_SCALE.length - 1 - CONFIDENCE_SCALE.indexOf(c);
  const overclaimed = onTopic.some((c) => rank(c.confidence) > rank(truth.confidence));
  const first = onTopic[0];
  if (!first) return { verdict: "missed" as const, overclaimed, falseAlarms };

  const named = first.evidence.flatMap((e) => (e.type === "event" ? [e.kind] : []));
  const right =
    Math.abs(first.startRound - truth.changeStarts) <= 1 &&
    first.confidence === truth.confidence &&
    named.length === truth.acceptableCauses.length &&
    truth.acceptableCauses.every((c) => named.includes(c)) &&
    (!truth.via || first.evidence.some((e) => e.type === "metric" && e.metric === truth.via));
  return { verdict: right ? ("right" as const) : ("wrong" as const), overclaimed, falseAlarms };
}

/** mulberry32, seeded from a string. Same seed, same world. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal noise (Box-Muller). */
function gaussian(rand: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
