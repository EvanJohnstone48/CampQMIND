// What one shift produced, besides the new world state.

import type { Good, Inventory } from "./goods";
import type { ActionType, Intent } from "./brain";
import type { WorldEvent } from "./events";
import type { ShiftMetrics } from "./metrics";
import type { OverseerAction } from "./overseer";

export interface MinerActivity {
  minerId: string;
  action: ActionType;
  siteId?: string;
  jobId?: string;
  from: string;
  to: string;
  output?: Partial<Inventory>;
  /** False if the brain's intent was invalid and the miner rested instead. */
  valid: boolean;
  reason?: string;
}

/** One participant's fill in a uniform-price auction. "tradingPost" is the outside world. */
export interface TradeFill {
  good: Good;
  participantId: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
}

export interface ShiftRecord {
  shift: number;
  day: number;
  events: WorldEvent[];
  metrics: ShiftMetrics;
  activities: MinerActivity[];
  trades: TradeFill[];
}

/** Everything that went INTO a shift. Recording these makes any run replayable bit-for-bit. */
export interface ShiftInputs {
  intents: Record<string, Intent>;
  overseer: OverseerAction[];
  /** Optional extra well-being per miner from Lane 2's social layer (guild belonging, fear...). */
  social?: Record<string, number>;
}
