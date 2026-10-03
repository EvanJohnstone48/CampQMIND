import type { Development } from "./detect.js";
import type { Confidence, NarratorConfig, NarratorSettings, RoundSnapshot, WorldEvent } from "./types.js";

export interface Suspect {
  event: WorldEvent;
  /** Shifts between the event and the start of the change. */
  lag: number;
  /** The sim's own rules say this event moves this metric this way. */
  known: boolean;
}

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
  /** Other suspects worth naming (for "known-shared" and "timing-shared"). */
  others: Suspect[];
}

/**
 * Ranks events that happened shortly before a change. Evidence used:
 *  1. timing: the event came at most `lookbackRounds` shifts before the change began
 *     (an event after the change began can't have caused it)
 *  2. a known link from the sim's rules (config.knownEffects)
 *  3. whether other suspects compete for the same change
 *
 * Without re-running the world, timing plus a known link is the best evidence we
 * have, so the ceiling is "likely". "Almost certainly" is reserved for a
 * counterfactual re-run (not built yet).
 */
export function attribute(
  dev: Development,
  history: RoundSnapshot[],
  config: NarratorConfig,
  settings: NarratorSettings,
): Attribution {
  const from = dev.startRound - settings.lookbackRounds;
  const suspects: Suspect[] = history
    .flatMap((s) => s.events)
    .filter((e) => e.round >= from && e.round <= dev.startRound)
    .map((event) => ({
      event,
      lag: dev.startRound - event.round,
      known: isKnownEffect(event.kind, dev, config),
    }))
    // Known links first, then the closest in time.
    .sort((a, b) => Number(b.known) - Number(a.known) || a.lag - b.lag);

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
  const others =
    reason === "known-shared" ? known.slice(1) : reason === "timing-shared" ? suspects : [];

  return { reason, confidence: REASON_CONFIDENCE[reason], top, others };
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
  const already = new Set(suspects.map((s) => s.event));
  return history
    .flatMap((s) => s.events)
    .filter((e) => !already.has(e) && e.round >= from && e.round <= to && isKnownEffect(e.kind, dev, config))
    .map((event) => ({ event, lag: dev.startRound - event.round, known: true }));
}

function isKnownEffect(kind: string, dev: Development, config: NarratorConfig): boolean {
  return (config.knownEffects ?? []).some(
    (k) => k.event === kind && k.metric === dev.metric && (!k.direction || k.direction === dev.direction),
  );
}
