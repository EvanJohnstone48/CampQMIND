import { detect, type Development } from "./detect.js";
import {
  CONFIDENCE_SCALE,
  type Confidence,
  type NarratorConfig,
  type NarratorSettings,
  type RoundSnapshot,
  type WorldEvent,
} from "./types.js";

/** Something that might have caused a change: an event, or another change that began just before it. */
export type Suspect =
  | {
      type: "event";
      event: WorldEvent;
      /** Shifts between the suspect and the start of the change (negative: after it). */
      lag: number;
      /** The sim's own rules say this moves this metric this way. */
      known: boolean;
    }
  | {
      type: "change";
      dev: Development;
      lag: number;
      /** Only changes with a configured KnownLink become suspects. */
      known: true;
      /** What caused that change in turn. */
      cause: Attribution;
    };

/**
 * Why the narrator landed on its confidence. Each reason maps to exactly one
 * confidence word and one plain-language explanation (see evidence.ts).
 */
export type Reason =
  | "known-sole" //    one suspect is known to cause this                      → likely
  | "known-shared" //  several suspects are known to cause this                 → possibly
  | "timing-only" //   one suspect, right timing, but no known link             → possibly
  | "timing-shared" // several suspects, none known to cause this               → unclear
  | "none"; //         nothing recorded happened just before                    → unclear

export const REASON_CONFIDENCE: Record<Reason, Confidence> = {
  "known-sole": "likely",
  "known-shared": "possibly",
  "timing-only": "possibly",
  "timing-shared": "unclear",
  none: "unclear",
};

export interface Attribution {
  reason: Reason;
  confidence: Confidence;
  /** The suspect named on the card, if any. */
  top: Suspect | null;
  /** Other suspects named alongside it (for "known-shared" and "timing-shared"). */
  others: Suspect[];
  /** Everything looked at, including rivals found outside the window. For level 3. */
  considered: Suspect[];
  /** Shifts searched for suspects. */
  window: { from: number; to: number };
}

export interface AttributionContext {
  history: RoundSnapshot[];
  config: NarratorConfig;
  settings: NarratorSettings;
}

/** A chain longer than this (event → change → change → this) isn't followed further. */
const MAX_CHAIN = 3;

/**
 * Ranks what happened shortly before a change. Evidence used:
 *  1. timing: the suspect came at most `lookbackRounds` shifts before the change began
 *     (anything after the change began can't have caused it)
 *  2. a known link from the sim's rules (config.knownEffects, config.knownLinks)
 *  3. whether other suspects compete for the same change
 *
 * Without re-running the world, timing plus a known link is the best evidence we
 * have, so the ceiling is "likely". "Almost certainly" is reserved for a
 * counterfactual re-run (not built yet).
 */
export function attribute(dev: Development, ctx: AttributionContext, visited: string[] = []): Attribution {
  const { history, config, settings } = ctx;
  const window = { from: dev.startRound - settings.lookbackRounds, to: dev.startRound };
  const inWindow = (round: number) => round >= window.from && round <= window.to;
  const chain = [...visited, dev.metric];

  const events: Suspect[] = history
    .flatMap((s) => s.events)
    .filter((e) => inWindow(e.round))
    .map((event) => ({ type: "event", event, lag: dev.startRound - event.round, known: isKnownEffect(event.kind, dev, config) }));

  // Changes in linked metrics. Searched back far enough to cover this window, so a
  // long-running upstream change still counts after it has become "old news" itself.
  const linkedMetrics = new Set((config.knownLinks ?? []).filter((l) => l.to === dev.metric).map((l) => l.from));
  const reach = { ...settings, maxEpisodeRounds: dev.round - window.from + 1 };
  const changes: Suspect[] =
    chain.length > MAX_CHAIN
      ? []
      : [...linkedMetrics]
          .filter((m) => !chain.includes(m))
          .map((m) => detect(history, m, reach))
          .filter((u): u is Development => u !== null && inWindow(u.startRound) && isKnownLink(u, dev, config))
          .map((u) => ({ type: "change", dev: u, lag: dev.startRound - u.startRound, known: true, cause: attribute(u, ctx, chain) }));

  // Known links first, then the closest in time.
  const suspects = [...changes, ...events].sort((a, b) => Number(b.known) - Number(a.known) || a.lag - b.lag);

  const known = suspects.filter((s) => s.known);
  // The start of a change is only known to within a shift or so. Before calling one
  // known cause "likely", look wider (twice as far back, and one shift after the start)
  // for a rival known cause; if there is one, say "possibly" and name both.
  // When in doubt, the narrator says less.
  const rivals = known.length === 1 ? knownRivals(suspects, dev, history, config, settings) : [];
  known.push(...rivals);

  let reason: Reason;
  if (known.length === 1) reason = "known-sole";
  else if (known.length > 1) reason = "known-shared";
  else if (suspects.length === 1) reason = "timing-only";
  else if (suspects.length > 1) reason = "timing-shared";
  else reason = "none";

  const top = reason === "timing-shared" || reason === "none" ? null : suspects[0];
  const others = reason === "known-shared" ? known.filter((s) => s !== top) : reason === "timing-shared" ? suspects : [];

  return {
    reason,
    confidence: REASON_CONFIDENCE[reason],
    top,
    others,
    considered: [...suspects, ...rivals],
    window,
  };
}

/** One step of a cause chain, from the change itself back towards the root. */
export interface ChainStep {
  attribution: Attribution;
  suspect: Suspect;
}

/** Follows the named cause back while it's a single change with a cause of its own. */
export function chainOf(a: Attribution): ChainStep[] {
  const steps: ChainStep[] = [];
  let current: Attribution | null = a;
  while (current?.top) {
    steps.push({ attribution: current, suspect: current.top });
    const next: Suspect = current.top;
    current = current.reason !== "known-shared" && next.type === "change" ? next.cause : null;
  }
  return steps;
}

/** A chain is only as sure as its weakest link. */
export function weakest(confidences: Confidence[]): Confidence {
  return confidences.reduce((a, b) => (CONFIDENCE_SCALE.indexOf(b) > CONFIDENCE_SCALE.indexOf(a) ? b : a));
}

function knownRivals(
  suspects: Suspect[],
  dev: Development,
  history: RoundSnapshot[],
  config: NarratorConfig,
  settings: NarratorSettings,
): Suspect[] {
  const from = dev.startRound - 2 * settings.lookbackRounds;
  const to = dev.startRound + 1;
  const already = new Set(suspects.flatMap((s) => (s.type === "event" ? [s.event] : [])));
  return history
    .flatMap((s) => s.events)
    .filter((e) => !already.has(e) && e.round >= from && e.round <= to && isKnownEffect(e.kind, dev, config))
    .map((event) => ({ type: "event", event, lag: dev.startRound - event.round, known: true }));
}

function isKnownEffect(kind: string, dev: Development, config: NarratorConfig): boolean {
  return (config.knownEffects ?? []).some(
    (k) => k.event === kind && k.metric === dev.metric && (!k.direction || k.direction === dev.direction),
  );
}

function isKnownLink(upstream: Development, dev: Development, config: NarratorConfig): boolean {
  return (config.knownLinks ?? []).some(
    (l) =>
      l.from === upstream.metric &&
      l.fromDirection === upstream.direction &&
      l.to === dev.metric &&
      (!l.direction || l.direction === dev.direction),
  );
}
