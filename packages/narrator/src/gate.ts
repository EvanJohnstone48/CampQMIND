import type { Confidence, Direction, EvidencePackage, NarratorSettings } from "./types.js";

/** Starts this close together are the same change, re-estimated. */
const SAME_CHANGE_SHIFTS = 2;

/**
 * Decides which packages become cards this shift, so the Overseer isn't spammed.
 * One card per change. A topic speaks again only when its story changes:
 * a new change starts, it turns around, or the confidence in the cause changes.
 * At most `maxCardsPerRound` cards per shift, biggest changes first.
 */
export class Gate {
  private shown = new Map<string, { startRound: number; direction: Direction; confidence: Confidence }>();

  constructor(private settings: NarratorSettings) {}

  select(packages: EvidencePackage[]): EvidencePackage[] {
    const picked = packages
      .filter((p) => {
        const last = this.shown.get(p.topic);
        return (
          !last ||
          Math.abs(p.startRound - last.startRound) > SAME_CHANGE_SHIFTS ||
          p.direction !== last.direction ||
          p.confidence !== last.confidence
        );
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.settings.maxCardsPerRound);

    for (const p of picked) {
      this.shown.set(p.topic, { startRound: p.startRound, direction: p.direction, confidence: p.confidence });
    }
    return picked;
  }
}
