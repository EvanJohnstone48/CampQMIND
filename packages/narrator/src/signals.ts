import { shoulder, triangle } from "./fuzzy.js";

// Turning numbers into words.
//
// The key quantity is "deviation": how far a value sits from its usual level,
// measured in units of its normal ups and downs (a z-score). It is what links
// the numbers to the plain words on a card:
//
//   deviation  meaning                                  card says
//   < 1        an ordinary wobble                       (nothing)
//   1 to 2     a bit off, often still noise             (nothing)
//   ~2.75+     rarely happens by chance                 "outside its normal ups and downs"
//   4+         far beyond anything seen recently        "far outside its normal ups and downs"

export interface Baseline {
  /** Average over the baseline window. */
  usual: number;
  /** Normal ups and downs (standard deviation) over the baseline window. */
  spread: number;
}

export function baselineOf(values: number[]): Baseline {
  const usual = mean(values);
  // Floor the spread so a perfectly flat metric doesn't make every tiny move look huge.
  const spread = Math.max(stdDev(values, usual), Math.abs(usual) * 0.02, 1e-6);
  return { usual, spread };
}

/** Fuzzy level from a deviation. "low"/"high" reach 0.5 at about 2.75 wobbles out. */
export function levelTerms(deviation: number) {
  return {
    low: shoulder(deviation, -2, -3.5),
    normal: triangle(deviation, -2.5, 0, 2.5),
    high: shoulder(deviation, 2, 3.5),
  };
}

/** Fuzzy trend from a slope measured in wobbles per shift. */
export function trendTerms(slope: number) {
  return {
    falling: shoulder(slope, -0.25, -0.75),
    stable: triangle(slope, -0.5, 0, 0.5),
    rising: shoulder(slope, 0.25, 0.75),
  };
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
}

/** Least-squares slope over equally spaced shifts. */
export function slopePerRound(ys: number[]): number {
  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  return den === 0 ? 0 : num / den;
}
