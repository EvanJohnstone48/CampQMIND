import { describe, expect, it } from "vitest";
import { defaultDials } from "./dials";
import { caveInChance, chopRate, crowdFactor, digRate, regrowForest, workFactor } from "./production";
import type { ForestState, VeinState } from "./world";

const dials = defaultDials();
const vein = (over: Partial<VeinState> = {}): VeinState => ({
  siteId: "v",
  ore: "copper",
  tonnage: 5000,
  extracted: 0,
  grade0: 1,
  gradeScale: 25,
  hardness0: 1,
  depth: 0,
  supportedDepth: 0,
  exhausted: false,
  ...over,
});

describe("production", () => {
  it("veins get poorer and harder as they get deeper", () => {
    expect(digRate(vein({ depth: 10 }), 1, dials)).toBeLessThan(digRate(vein({ depth: 0 }), 1, dials));
    expect(digRate(vein({ depth: 30 }), 1, dials)).toBeLessThan(digRate(vein({ depth: 10 }), 1, dials) * 0.6);
  });

  it("exhausted veins yield nothing", () => {
    expect(digRate(vein({ exhausted: true }), 1.5, dials)).toBe(0);
  });

  it("a gold-rush pocket multiplies yield", () => {
    const rich = vein({ ore: "gold", pocket: { remaining: 50, multiplier: 4, sourceEventId: "1:0" } });
    expect(digRate(rich, 1, dials)).toBeCloseTo(digRate(vein({ ore: "gold" }), 1, dials) * 4);
  });

  it("timber supports cut cave-in risk", () => {
    const bare = vein({ depth: 6, supportedDepth: 0 });
    const shored = vein({ depth: 6, supportedDepth: 6 });
    expect(caveInChance(shored, dials)).toBeLessThan(caveInChance(bare, dials));
    expect(caveInChance(shored, dials, 4)).toBeCloseTo(caveInChance(shored, dials) * 4);
  });

  it("crowding splits output once a site is full", () => {
    expect(crowdFactor(3, 6)).toBe(1);
    expect(crowdFactor(12, 6)).toBe(0.5);
  });

  it("tired, sick or far-walking workers deliver less", () => {
    expect(workFactor(0.2, 1, 0)).toBeLessThan(workFactor(1, 1, 0));
    expect(workFactor(1, 0.2, 0)).toBeLessThan(workFactor(1, 1, 0));
    expect(workFactor(1, 1, 0.5)).toBeLessThan(workFactor(1, 1, 0));
    expect(workFactor(1, 1, 5)).toBeGreaterThan(0);
  });

  it("forests regrow fastest at half capacity and slowly when stripped", () => {
    const f = (stock: number): ForestState => ({ siteId: "f", capacity: 600, stock, depleted: false });
    const growth = (stock: number) => regrowForest(f(stock), 0.03) - stock;
    expect(growth(300)).toBeGreaterThan(growth(30));
    expect(growth(300)).toBeGreaterThan(growth(580));
    expect(growth(0)).toBeGreaterThan(0);
    expect(regrowForest(f(600), 0.03)).toBeLessThanOrEqual(600);
  });

  it("a stripped forest yields less timber per chop", () => {
    const f = (stock: number): ForestState => ({ siteId: "f", capacity: 600, stock, depleted: false });
    expect(chopRate(f(60), 1, dials)).toBeLessThan(chopRate(f(600), 1, dials) / 2);
  });
});
