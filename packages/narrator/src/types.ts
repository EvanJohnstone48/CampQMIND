// The shapes the narrator reads and writes. Lane 1/2 output is mapped onto
// RoundSnapshot by an adapter, so nothing here depends on the sim's own types.

/** One shift of world data, as the narrator sees it. */
export interface RoundSnapshot {
  round: number;
  /** Named numbers for this shift, e.g. { goldPrice: 12.1, shareMining: 0.62 }. */
  metrics: Record<string, number>;
  /** Things that happened this shift (acts of god, god powers, cave-ins...). */
  events: WorldEvent[];
  /** Optional (Lane 2): how many miners each decision rule fired for this shift. */
  ruleFirings?: Record<string, number>;
}

export interface WorldEvent {
  kind: string;
  round: number;
  /** "overseer" if the player caused it, "world" if it happened on its own. */
  source?: "overseer" | "world";
}

export type MetricFormat = "share" | "coins" | "count" | "number";

export interface MetricInfo {
  /** Plain-language name that fits mid-sentence, e.g. "the gold price". Lower-case. */
  label: string;
  format: MetricFormat;
  /**
   * Smallest change worth mentioning, in the metric's own units (e.g. 0.05 for a share).
   * Stops a metric that sat at zero from raising an alarm when one miner moves it.
   */
  minChange?: number;
}

export type Direction = "up" | "down";

/**
 * A link the sim's own rules guarantee, e.g. "a gold rush pushes the gold
 * price down". Only Lane 1 (or Lane 2 for miner rules) can say this is true;
 * the narrator never invents one.
 */
export interface KnownEffect {
  event: string;
  metric: string;
  /** Leave out if the event can push the metric either way. */
  direction?: Direction;
}

/**
 * A link between two metrics the sim's rules guarantee, e.g. "when more miners
 * dig gold, the gold price falls". Lets cards show chains of causes. Only Lane 1
 * (or Lane 2) can say this is true; with no links, cards show no chains.
 */
export interface KnownLink {
  from: string;
  fromDirection: Direction;
  to: string;
  /** Leave out if it can push `to` either way. */
  direction?: Direction;
}

/** A dial or power the Overseer could use. With no entry, cards make no suggestion. */
export interface Lever {
  metric: string;
  direction: Direction;
  /** Finishes "You could ...", e.g. "lower the dig quota". No numbers. */
  text: string;
}

export interface RuleInfo {
  /** Plain-language rule, e.g. "if hungry, go farm". */
  label: string;
  /** Metrics this rule is known to move. */
  metrics: string[];
}

/** What the other lanes tell the narrator about their world. */
export interface NarratorConfig {
  /** Only these metrics are watched. */
  metrics: Record<string, MetricInfo>;
  /** Plain names for event kinds, e.g. { goldRush: "gold rush" }. */
  eventLabels?: Record<string, string>;
  knownEffects?: KnownEffect[];
  knownLinks?: KnownLink[];
  levers?: Lever[];
  rules?: Record<string, RuleInfo>;
}

export interface NarratorSettings {
  /** Shifts used to learn a metric's usual level and normal ups and downs. */
  baselineRounds: number;
  /** Shifts used to judge whether a change is still moving. */
  recentRounds: number;
  /** How far back a change can have started. Older than this, it's the new normal. */
  maxEpisodeRounds: number;
  /** How many shifts before a change an event can be and still count as a suspect. */
  lookbackRounds: number;
  maxCardsPerRound: number;
  /**
   * Cards whose cause is "unclear" need at least this priority (0 to ~1.2; size 6 wobbles = 1).
   * 0 shows them all. Raising it cuts alarm fatigue from changes nobody can explain.
   */
  unclearMinPriority: number;
}

export const DEFAULT_SETTINGS: NarratorSettings = {
  baselineRounds: 16,
  recentRounds: 4,
  maxEpisodeRounds: 16,
  lookbackRounds: 3,
  maxCardsPerRound: 2,
  unclearMinPriority: 0,
};

/** Fixed scale, strongest first. "almost certainly" needs a counterfactual re-run (not built yet). */
export const CONFIDENCE_SCALE = ["almost certainly", "likely", "possibly", "unclear"] as const;
export type Confidence = (typeof CONFIDENCE_SCALE)[number];

/**
 * How much a card says. Level 1 is a single glance line. Levels 2 and 3 build on
 * each other: 2 is the full "why", 3 adds how the narrator reached it.
 */
export type Level = 1 | 2 | 3;

export type StatementKind =
  | "glance" //    level 1: what happened and why, in one line
  | "observed" //  level 2: what was measured
  | "rule" //      level 2: a miner rule whose firings changed (Lane 2)
  | "inferred" //  level 2: the direct cause, led by its confidence word
  | "chain" //     level 2: the cause of the cause
  | "uncertain" // level 2: what we can't tell, and why
  | "suggested" // level 2: a configured lever
  | "measure" //   level 3: how big the change is next to normal noise
  | "suspect" //   level 3: everything considered as a cause, and what's known about it
  | "reasoning"; // level 3: which confidence rule applied

export interface Statement<T = string> {
  kind: StatementKind;
  level: Level;
  /** A template with {{slots}} in an EvidencePackage; finished text in a Card. */
  text: T;
}

export type EvidenceRef =
  | { type: "metric"; metric: string; fromRound: number; toRound: number }
  | { type: "event"; kind: string; round: number }
  | { type: "rule"; rule: string; round: number };

export type SlotFormat = MetricFormat | "percent" | "round" | "times";

/** A value filled into a template. Numbers only ever reach the text through slots. */
export type Slot =
  | { kind: "number"; value: number; format: SlotFormat }
  | { kind: "text"; text: string };

/** Everything one card is allowed to say, before it's put into words. Plain JSON. */
export interface EvidencePackage {
  id: string;
  round: number;
  topic: string;
  direction: Direction;
  /** First shift of the change. */
  startRound: number;
  confidence: Confidence;
  priority: number;
  /** Templates use {{slotName}} for every number and data-derived name. */
  headline: string;
  statements: Statement[];
  slots: Record<string, Slot>;
  evidence: EvidenceRef[];
}

export interface Card {
  id: string;
  round: number;
  topic: string;
  /** First shift of the change, for lining the card up with the timeline. */
  startRound: number;
  headline: string;
  statements: Statement[];
  /**
   * How sure the narrator is about the cause named in the glance line: the
   * weakest link if it's a chain. (The change itself is measured, not guessed.)
   */
  confidence: Confidence;
  priority: number;
  evidence: EvidenceRef[];
  writtenBy: "template" | "llm";
}
