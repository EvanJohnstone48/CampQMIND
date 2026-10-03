import { baselineOf, levelTerms, slopePerRound, trendTerms } from "./signals.js";
import type { Direction, NarratorSettings, RoundSnapshot } from "./types.js";

/** A change worth talking about. */
export interface Development {
  metric: string;
  direction: Direction;
  /** First shift of the change. */
  startRound: number;
  round: number;
  /** Usual level in the shifts before the change began. */
  usual: number;
  /** Average of the last two shifts. */
  now: number;
  /** Normal ups and downs (standard deviation) before the change. */
  spread: number;
  /** |deviation| of `now`: how many "normal wobbles" away from usual. */
  size: number;
  /** "clear": outside the normal range. "strong": far outside it. */
  strength: "clear" | "strong";
  /** Still moving in the same direction, or has it levelled off at the new level? */
  stillMoving: boolean;
}

/** Deviation at which a change is called "far outside" its normal range. */
export const STRONG_DEVIATION = 4;

/**
 * Finds the start of a change by trying each recent shift t as the start point,
 * earliest first. Each shift is judged on a two-shift average (so one noisy
 * shift can't fake a start) against the usual level of the shifts before t.
 * t is accepted when:
 *  - the shift before t didn't itself look like a start (under 1.5 wobbles out)
 *  - t and t+1 are at least 1.5 wobbles out, in the same direction
 *  - at least 80% of shifts from t to now stay at least one wobble out
 *  - each of the last two is at least 2.5 wobbles out
 *  - the level now is fuzzily "low" or "high" (degree >= 0.5)
 * The two-shift average reacts a shift late, so if the raw value just before t
 * was already out, the start moves back to it.
 *
 * Anchoring "usual" to the shifts before the start keeps the story stable: as
 * the change goes on, the narrator keeps naming the same start and suspects.
 * Once the start is older than `maxEpisodeRounds`, it's the new normal and
 * nothing is reported.
 */
export function detect(history: RoundSnapshot[], metric: string, settings: NarratorSettings): Development | null {
  const { baselineRounds, maxEpisodeRounds, recentRounds } = settings;
  const raw = history.map((s) => s.metrics[metric]);
  if (!raw.every((v) => v !== undefined && Number.isFinite(v))) return null;
  const values = raw as number[];
  const n = values.length;
  const smooth = (i: number) => (values[i - 1] + values[i]) / 2;

  for (let t = Math.max(baselineRounds + 1, n - maxEpisodeRounds); t <= n - 2; t++) {
    const { usual, spread } = baselineOf(values.slice(t - baselineRounds, t));
    const dev = (v: number) => (v - usual) / spread;
    const devs = values.slice(t).map((_, k) => dev(smooth(t + k)));
    const sign = Math.sign(devs[0]);
    const out = (z: number, by: number) => z * sign >= by;

    if (sign === 0 || out(dev(smooth(t - 1)), 1.5)) continue;
    if (!out(devs[0], 1.5) || !out(devs[1], 1.5)) continue;
    if (devs.filter((z) => out(z, 1)).length < 0.8 * devs.length) continue;
    if (!devs.slice(-2).every((z) => out(z, 2.5))) continue;

    const now = devs[devs.length - 1] * spread + usual;
    const deviation = dev(now);
    const level = levelTerms(deviation);
    if ((sign > 0 ? level.high : level.low) < 0.5) continue;

    const start = out(dev(values[t - 1]), 1) ? t - 1 : t;
    const trend = trendTerms(slopePerRound(values.slice(-recentRounds)) / spread);
    const size = Math.abs(deviation);
    return {
      metric,
      direction: sign > 0 ? "up" : "down",
      startRound: history[start].round,
      round: history[n - 1].round,
      usual,
      now,
      spread,
      size,
      strength: size >= STRONG_DEVIATION ? "strong" : "clear",
      stillMoving: (sign > 0 ? trend.rising : trend.falling) >= 0.5,
    };
  }
  return null;
}
