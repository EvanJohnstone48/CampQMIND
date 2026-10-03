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
}

export const DEFAULT_SETTINGS: NarratorSettings = {
  baselineRounds: 16,
  recentRounds: 4,
  maxEpisodeRounds: 16,
  lookbackRounds: 3,
  maxCardsPerRound: 2,
};

/** Fixed scale, strongest first. "almost certainly" needs a counterfactual re-run (not built yet). */
export const CONFIDENCE_SCALE = ["almost certainly", "likely", "possibly", "unclear"] as const;
export type Confidence = (typeof CONFIDENCE_SCALE)[number];

export type StatementKind = "observed" | "rule" | "inferred" | "uncertain" | "suggested";

export type EvidenceRef =
  | { type: "metric"; metric: string; fromRound: number; toRound: number }
  | { type: "event"; kind: string; round: number }
  | { type: "rule"; rule: string; round: number };

export type SlotFormat = MetricFormat | "percent" | "round";

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
  statements: { kind: StatementKind; template: string }[];
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
  statements: { kind: StatementKind; text: string }[];
  /** How sure the narrator is about the cause (not about the change itself, which is measured). */
  confidence: Confidence;
  priority: number;
  evidence: EvidenceRef[];
  writtenBy: "template" | "llm";
}
