import { describe, expect, it } from "vitest";
import {
  HIGH,
  LOW,
  and,
  describe as strongest,
  evaluate,
  fuzzify,
  infer,
  is,
  not,
  or,
  rule,
  ruleText,
  shoulderLeft,
  shoulderRight,
  trap,
  tri,
  variable,
} from "./index";

describe("membership functions", () => {
  it("triangle peaks at its middle", () => {
    const t = tri(0, 5, 10);
    expect(t(0)).toBe(0);
    expect(t(2.5)).toBe(0.5);
    expect(t(5)).toBe(1);
    expect(t(7.5)).toBe(0.5);
    expect(t(10)).toBe(0);
  });

  it("trapezoid is flat on top", () => {
    const t = trap(0, 2, 4, 6);
    expect(t(1)).toBe(0.5);
    expect(t(3)).toBe(1);
    expect(t(5)).toBe(0.5);
  });

  it("shoulders saturate at the edges", () => {
    expect(shoulderLeft(1, 3)(0)).toBe(1);
    expect(shoulderLeft(1, 3)(2)).toBe(0.5);
    expect(shoulderLeft(1, 3)(9)).toBe(0);
    expect(shoulderRight(1, 3)(0)).toBe(0);
    expect(shoulderRight(1, 3)(2)).toBe(0.5);
    expect(shoulderRight(1, 3)(9)).toBe(1);
  });
});

const hunger = variable("hunger", { low: shoulderLeft(0.2, 0.5), high: shoulderRight(0.5, 0.8) });
const energy = variable("energy", { low: shoulderLeft(0.2, 0.5), high: shoulderRight(0.4, 0.8) });

describe("fuzzify", () => {
  it("turns numbers into degrees per term", () => {
    const d = fuzzify([hunger, energy], { hunger: 0.65, energy: 0.9 });
    expect(d.hunger.high).toBe(0.5);
    expect(d.hunger.low).toBe(0);
    expect(d.energy.high).toBe(1);
    expect(strongest(d)).toEqual({ hunger: ["high", 0.5], energy: ["high", 1] });
  });

  it("skips inputs that are missing or not numbers", () => {
    expect(fuzzify([hunger], { hunger: Number.NaN })).toEqual({});
  });
});

describe("conditions", () => {
  const d = fuzzify([hunger, energy], { hunger: 0.65, energy: 0.3 });
  it("AND is min, OR is max, NOT is complement", () => {
    expect(evaluate(and(is("hunger", "high"), is("energy", "low")), d)).toBe(0.5);
    expect(evaluate(or(is("hunger", "high"), is("energy", "low")), d)).toBeCloseTo(0.6667, 3);
    expect(evaluate(not(is("hunger", "high")), d)).toBe(0.5);
  });

  it("unknown variables count as false", () => {
    expect(evaluate(is("thirst", "high"), d)).toBe(0);
  });
});

describe("inference", () => {
  const rules = [
    rule("tired-rest", is("energy", "low"), "rest", HIGH),
    rule("fresh-work", is("energy", "high"), "rest", LOW),
    rule("hungry-farm", is("hunger", "high"), "farm", HIGH),
  ];

  it("blends rules by how strongly they fire", () => {
    const res = infer(rules, fuzzify([hunger, energy], { hunger: 0.2, energy: 0.45 }));
    // energy 0.45: low 0.1667, high 0.125 -> weighted between LOW and HIGH, nearer HIGH
    expect(res.outputs.rest).toBeGreaterThan(0.5);
    expect(res.outputs.rest).toBeLessThan(HIGH);
    expect(res.outputs.farm).toBeUndefined();
  });

  it("records which rules fired, strongest first, in readable form", () => {
    const res = infer(rules, fuzzify([hunger, energy], { hunger: 0.9, energy: 0.1 }));
    expect(res.firings.map((f) => f.ruleId)).toEqual(["hungry-farm", "tired-rest"]);
    expect(res.firings[0].text).toBe("IF hunger is high THEN farm is high");
    expect(res.support.rest).toBe(1);
  });

  it("weights scale a rule's pull", () => {
    const heavy = [rule("a", is("energy", "low"), "rest", HIGH, 3), rule("b", is("energy", "low"), "rest", LOW, 1)];
    const res = infer(heavy, fuzzify([energy], { energy: 0 }));
    expect(res.outputs.rest).toBeCloseTo((3 * HIGH + LOW) / 4, 4);
  });

  it("writes nested rules with brackets", () => {
    expect(ruleText(rule("x", and(is("a", "b"), or(is("c", "d"), not(is("e", "f")))), "o", HIGH))).toBe(
      "IF a is b AND (c is d OR NOT e is f) THEN o is high",
    );
  });
});
