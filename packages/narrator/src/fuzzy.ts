// Minimal membership functions. Swap for packages/fuzzy once Lane 2 ships it.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** 0 at `zero`, 1 at `full`, linear between, flat outside. Works in either direction. */
export function shoulder(x: number, zero: number, full: number): number {
  return clamp01((x - zero) / (full - zero));
}

/** 0 at `a` and `c`, 1 at `b`. */
export function triangle(x: number, a: number, b: number, c: number): number {
  if (x <= a || x >= c) return 0;
  return x <= b ? (x - a) / (b - a) : (c - x) / (c - b);
}
