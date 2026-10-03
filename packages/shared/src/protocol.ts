// WebSocket messages between the server (Lane 1) and the browser (Lane 4).

import type { Good } from "./goods";
import type { WorldMap } from "./map";
import type { MinerPublic } from "./miner";
import type { JobView, PriceView, SiteView } from "./brain";
import type { DialDef, OverseerAction } from "./overseer";
import type { ShiftMetrics } from "./metrics";
import type { ShiftRecord } from "./record";

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
}

export type ServerMessage =
  | { type: "hello"; map: WorldMap; dialDefs: DialDef[]; snapshot: WorldSnapshot; status: ServerStatus }
  | { type: "shift"; update: ShiftUpdate }
  | { type: "status"; status: ServerStatus }
  | { type: "reverted"; snapshot: WorldSnapshot }
  | { type: "forkResult"; requestId: string; baseline: ShiftMetrics[]; variant: ShiftMetrics[] }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "overseer"; action: OverseerAction }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "speed"; roundMs: number }
  /** Go back to the world as it was at the END of this shift; later history is discarded. */
  | { type: "revert"; toShift: number }
  /** Ask the Oracle-style question: run forward N shifts with and without these actions. */
  | { type: "fork"; requestId: string; shifts: number; actions: OverseerAction[] };
