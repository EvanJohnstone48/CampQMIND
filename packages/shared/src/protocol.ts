// WebSocket messages between the server (Lane 1) and the browser (Lane 4).

import type { Good } from "./goods";
import type { WorldMap } from "./map";
import type { MinerPublic } from "./miner";
import type { JobView, PriceView, SiteView } from "./brain";
import type { DialDef, OverseerAction } from "./overseer";
import type { ShiftMetrics } from "./metrics";
import type { ShiftRecord } from "./record";

/**
 * A narrator explanation card (Lane 3's Card, from @motherlode/narrator). Kept structural here so
 * the contract doesn't depend on the narrator package.
 */
export interface NarratorCard {
  id: string;
  round: number;
  topic: string;
  startRound: number;
  headline: string;
  statements: { kind: string; level: 1 | 2 | 3; text: string }[];
  confidence: string;
  priority: number;
  evidence: unknown[];
  writtenBy: "template" | "llm";
}

/** A plain-language explanation of one dashboard chart, made on request. */
export interface ChartExplanation {
  chart: string;
  title: string;
  /** What the chart is and what drives it, in everyday words. */
  whatItShows: string;
  /** How the line moved over the period. */
  whatHappened: string;
  /** Cause and effect, one step per line. */
  why: string[];
  fromShift: number;
  toShift: number;
  /** "llm" when Gemini worded it (and every number checked out); "template" otherwise. */
  writtenBy: "llm" | "template";
}

/** Full picture of the world, sent on connect and after a revert. */
export interface WorldSnapshot {
  seed: string;
  shift: number;
  day: number;
  miners: MinerPublic[];
  /** Site state as seen from nowhere in particular (travel is 0). */
  sites: SiteView[];
  jobs: JobView[];
  prices: Record<Good, PriceView>;
  dials: Record<string, number>;
  metrics?: ShiftMetrics;
}

export interface ServerStatus {
  paused: boolean;
  roundMs: number;
  shift: number;
}

/** Sent once per shift. */
export interface ShiftUpdate extends ShiftRecord {
  miners: MinerPublic[];
  sites: SiteView[];
  jobs: JobView[];
  /** New narrator cards this shift. */
  cards: NarratorCard[];
}

export type ServerMessage =
  | { type: "hello"; map: WorldMap; dialDefs: DialDef[]; snapshot: WorldSnapshot; status: ServerStatus; cards: NarratorCard[]; brains: string }
  | { type: "shift"; update: ShiftUpdate }
  | { type: "status"; status: ServerStatus }
  | { type: "reverted"; snapshot: WorldSnapshot; cards: NarratorCard[] }
  | { type: "forkResult"; requestId: string; baseline: ShiftMetrics[]; variant: ShiftMetrics[] }
  | { type: "explanation"; requestId: string; chart: string; explanation?: ChartExplanation; error?: string }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "overseer"; action: OverseerAction }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "speed"; roundMs: number }
  /** Go back to the world as it was at the END of this shift; later history is discarded. */
  | { type: "revert"; toShift: number }
  /** Ask the Oracle-style question: run forward N shifts with and without these actions. */
  | { type: "fork"; requestId: string; shifts: number; actions: OverseerAction[] }
  /** Ask the narrator to explain one dashboard chart in plain words (uses Gemini when the server has a key). */
  | { type: "explain"; requestId: string; chart: string };
