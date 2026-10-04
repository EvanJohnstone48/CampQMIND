// The contract between the world (Lane 1) and the miners' brains (Lane 2).
// Each shift the sim builds an Observation per miner; a brain returns an Intent.
// Invalid intents never break the world: the sim turns them into rest and logs why.

import type { Good } from "./goods";
import type { MinerView } from "./miner";
import type { WorldEvent } from "./events";
import type { SiteKind } from "./map";

export type WorkTask = "dig" | "chop" | "farm" | "smelt" | "build";

export type Action =
  | { type: "rest" }
  | { type: "dig"; siteId: string }
  | { type: "chop"; siteId: string }
  | { type: "farm"; siteId: string }
  | { type: "smelt"; siteId: string }
  | { type: "build"; siteId: string }
  /** Work a posted job; the output goes to the employer, who pays the wage. */
  | { type: "work"; jobId: string };

export type ActionType = Action["type"];
export const ACTION_TYPES: ActionType[] = ["rest", "dig", "chop", "farm", "smelt", "build", "work"];

/** A limit order for this shift's auction. Unbacked orders are trimmed to what you can pay for or deliver. */
export interface Order {
  good: Good;
  side: "buy" | "sell";
  qty: number;
  /** Buy: the most you'll pay per unit. Sell: the least you'll accept. Whole coins. */
  limit: number;
}

export interface JobOffer {
  siteId: string;
  task: WorkTask;
  /** Coins per shift. */
  wage: number;
  openings: number;
}

export interface Intent {
  action: Action;
  orders?: Order[];
  /** Ask the bank for a new loan of this many coins. */
  borrow?: number;
  /** Pay this much extra off your loans now. */
  repay?: number;
  postJob?: JobOffer;
  cancelJobs?: string[];
  /** Coins to spend on comforts from the Trading Post this shift (raises the comfort need). */
  spendOnComforts?: number;
  /** Smelter owners only: coins charged per unit of ore smelted by non-employees. */
  smelterFee?: number;
  /** One line, in the brain's own words, for the log and narrator. */
  reason?: string;
  /** Anything the brain wants logged (fuzzy rule firings, LLM tool calls). Passed through untouched. */
  trace?: unknown;
}

export interface PriceView {
  /** Last clearing price; carries over when nothing trades. */
  last: number;
  /** Units traded last shift. */
  volume: number;
  bestBid?: number;
  bestAsk?: number;
}

export interface SiteView {
  id: string;
  kind: SiteKind;
  name: string;
  /** Walking time from where the miner is now, as a fraction of a shift. */
  travel: number;
  capacity: number;
  workersLastShift: number;
  ownerId?: string;
  ore?: "copper" | "gold";
  /** Veins: how deep the shaft is (public), and how much of it has no timber supports. */
  depth?: number;
  unsupportedDepth?: number;
  exhausted?: boolean;
  /** A reported rich strike (after a gold rush): public news until the pocket is dug out. */
  richStrike?: boolean;
  /** Forests: remaining stock as a fraction of capacity. */
  stockFraction?: number;
  /** Farms. */
  fertility?: number;
  commons?: boolean;
  /** Smelters. */
  fee?: number;
  /** House lots. */
  building?: { ownerId: string; progress: number; required: number; complete: boolean };
}

export interface JobView {
  id: string;
  employerId: string;
  siteId: string;
  task: WorkTask;
  wage: number;
  openings: number;
  /** Workers who took this job last shift; if it equals openings, the job is probably full. */
  hiredLastShift: number;
  /** Times this employer failed to pay a wage in full. */
  arrears: number;
}

export interface Observation {
  seed: string;
  shift: number;
  day: number;
  /** The second shift of the day: interest and loan payments happen at its end. */
  isDayEnd: boolean;
  self: MinerView;
  prices: Record<Good, PriceView>;
  /** Standing prices at the Trading Post: what it pays for exports and charges for imports. */
  tradingPost: { buys: Partial<Record<Good, number>>; sells: Partial<Record<Good, number>> };
  sites: SiteView[];
  jobs: JobView[];
  bank: { ratePerDay: number; myLimit: number; lending: boolean };
  /** Current dial values (house costs, rent, cave-in risk...). */
  dials: Record<string, number>;
  /** Notable events this miner saw last shift (lightning nearby, a gold rush rumour...). */
  witnessed: WorldEvent[];
}

/** A synchronous brain. The sim, CLI and Oracle forks use these. */
export type Brain = (obs: Observation) => Intent;
/** An async brain (e.g. an LLM). Only the live server awaits these. */
export type AsyncBrain = (obs: Observation) => Promise<Intent>;
