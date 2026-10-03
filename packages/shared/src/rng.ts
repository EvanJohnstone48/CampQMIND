// Seeded randomness for the whole project. Never use Math.random() in sim or agents.
//
// Randomness is KEYED, not sequential: every draw comes from a generator built from
// (world seed, shift, system, entity id). "Cave-in roll for miner m042 on shift 310"
// always gives the same number, no matter what else happened that shift. That keeps
// counterfactual replays honest: removing one cause can't reshuffle unrelated draws.

/** 32-bit string hash (FNV-1a with a murmur3 finaliser for good avalanche). */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). Mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Standard normal (Box-Muller). */
  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Rounds a non-negative real to an integer while keeping its expected value:
   * 2.3 becomes 3 with probability 0.3, otherwise 2. Lets goods stay integers.
   */
  roundStochastic(x: number): number {
    if (x <= 0) return 0;
    const whole = Math.floor(x);
    return whole + (this.next() < x - whole ? 1 : 0);
  }

  /** Returns a shuffled copy (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** A fresh generator for one specific purpose, e.g. keyedRng(seed, shift, "cave-in", minerId). */
export function keyedRng(seed: string, ...key: (string | number)[]): Rng {
  return new Rng(hashString([seed, ...key].join("|")));
}
