import { describe, expect, it } from "vitest";
import { Rng, hashString, keyedRng } from "./rng";

describe("keyed randomness", () => {
  it("gives the same numbers for the same key", () => {
    const a = keyedRng("demo", 12, "cave-in", "m001");
    const b = keyedRng("demo", 12, "cave-in", "m001");
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("gives different streams for different keys", () => {
    expect(keyedRng("demo", 12, "cave-in", "m001").next()).not.toBe(keyedRng("demo", 12, "cave-in", "m002").next());
    expect(keyedRng("demo", 12, "cave-in", "m001").next()).not.toBe(keyedRng("demo", 13, "cave-in", "m001").next());
    expect(keyedRng("demo", 12, "cave-in", "m001").next()).not.toBe(keyedRng("other", 12, "cave-in", "m001").next());
  });

  it("is unaffected by draws made under other keys", () => {
    const before = keyedRng("demo", 5, "work", "m003").next();
    const noise = keyedRng("demo", 5, "work", "m002");
    for (let i = 0; i < 100; i++) noise.next();
    expect(keyedRng("demo", 5, "work", "m003").next()).toBe(before);
  });

  it("keeps values in range", () => {
    const r = new Rng(hashString("range"));
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("stochastic rounding keeps the expected value", () => {
    const r = new Rng(hashString("rounding"));
    let total = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) total += r.roundStochastic(2.3);
    expect(total / n).toBeCloseTo(2.3, 1);
    expect(r.roundStochastic(0)).toBe(0);
    expect(r.roundStochastic(-1)).toBe(0);
  });
});
