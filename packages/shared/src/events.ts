// Notable things that happened in a shift. The narrator's raw evidence.
// Routine work (who dug what) is in ShiftRecord.activities, not here.

import type { Good } from "./goods";

export type EventKind =
  | "market-clear" // one per good per shift that traded
  | "price-move" // a good's price moved sharply
  | "cave-in"
  | "injury"
  | "vein-exhausted"
  | "forest-depleted"
  | "house-started"
  | "house-complete"
  | "loan-issued"
  | "loan-denied"
  | "loan-repaid"
  | "loan-missed"
  | "loan-default"
  | "credit-freeze"
  | "credit-thaw"
  | "hunger" // a miner became hungry
  | "starving" // a miner has no food and no nourishment left
  | "collapse" // health hit zero; bedridden
  | "poor-relief"
  | "job-posted"
  | "job-closed"
  | "hired"
  | "quit"
  | "wage-arrears"
  | "invalid-intent"
  | "dial-changed"
  | "act-of-god"
  | "god-power"
  | "rumour";

export type EventValue = number | string | boolean | null;

export interface WorldEvent {
  /** Unique within a run: `${shift}:${n}`. */
  id: string;
  shift: number;
  kind: EventKind;
  /** Miners involved, most important first. */
  actors?: string[];
  siteId?: string;
  good?: Good;
  data?: Record<string, EventValue>;
  /**
   * Ground truth the sim KNOWS contributed, as event ids (e.g. the earthquake behind a cave-in)
   * or "dial:<key>" references. Lane 3 scores explanations against this.
   */
  causes?: string[];
  /** Miners who saw it happen (for trust and fear). */
  witnesses?: string[];
  /** A short plain-language label for logs. Not for the narrator to copy. */
  text?: string;
}
