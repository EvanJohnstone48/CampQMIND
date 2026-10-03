// Whole-world tests: determinism, replay, counterfactual isolation, books that always balance.

import { describe, expect, it } from "vitest";
import { keyedRng, type Intent, type OverseerAction } from "@motherlode/shared";
import { balanceReport } from "./balance";
import { checkInvariants } from "./books";
import { PLACEHOLDER_MAP } from "./placeholderMap";
import { baselineBrain } from "./baselineBrain";
import { decideAll, forkCompare, hashState, recordRun, replayRun, runForward } from "./run";
import { step } from "./step";
import { createWorld } from "./world";

const map = PLACEHOLDER_MAP;

describe("determinism", () => {
  it("the same seed gives the same world, shift for shift", () => {
    const a = createWorld({ seed: "same", map });
    const b = createWorld({ seed: "same", map });
    const ra = runForward(a.ctx, a.state, { shifts: 120 });
    const rb = runForward(b.ctx, b.state, { shifts: 120 });
    expect(hashState(ra.state)).toBe(hashState(rb.state));
  });

  it("different seeds give different worlds", () => {
    const a = createWorld({ seed: "one", map });
    const b = createWorld({ seed: "two", map });
    expect(hashState(runForward(a.ctx, a.state, { shifts: 20 }).state)).not.toBe(hashState(runForward(b.ctx, b.state, { shifts: 20 }).state));
  });

  it("replaying recorded inputs reproduces a run exactly, without any brain", () => {
    const { log } = recordRun(map, { seed: "replay", population: 100 }, {
      shifts: 80,
      plan: { 20: [{ type: "actOfGod", kind: "goldRush" }], 40: [{ type: "godPower", kind: "boon", minerId: "m003" }] },
    });
    const { state } = replayRun(JSON.parse(JSON.stringify(log)));
    expect(hashState(state)).toBe(log.finalHash);
  });
});

describe("counterfactual isolation", () => {
  it("an intervention on one miner leaves everyone else's dice untouched", () => {
    const { ctx, state: start } = createWorld({ seed: "fork", map });
    const { state } = runForward(ctx, start, { shifts: 30 });
    const intents = decideAll(ctx, state, baselineBrain);
    const without = step(ctx, state, { intents, overseer: [] }).record;
    const withBoon = step(ctx, state, { intents, overseer: [{ type: "godPower", kind: "boon", minerId: "m005" }] }).record;
    const others = (r: typeof without) => r.activities.filter((a) => a.minerId !== "m005").map((a) => [a.minerId, a.action, a.siteId, a.output]);
    expect(others(withBoon)).toEqual(others(without));
  });

  it("fork-and-compare shows a gold rush raising gold output", () => {
    const { ctx, state: start } = createWorld({ seed: "oracle", map });
    const { state } = runForward(ctx, start, { shifts: 20 });
    const res = forkCompare(ctx, state, 30, [{ type: "actOfGod", kind: "goldRush", siteId: "gold-1" }]);
    const gold = (ms: typeof res.baseline) => ms.reduce((a, m) => a + m.output.gold, 0);
    expect(gold(res.variant)).toBeGreaterThan(gold(res.baseline));
    expect(res.baseline).toHaveLength(30);
  });
});

describe("the books always balance", () => {
  it("money and goods are conserved through random chaos", () => {
    const kinds: OverseerAction[] = [
      { type: "actOfGod", kind: "earthquake" },
      { type: "actOfGod", kind: "goldRush" },
      { type: "actOfGod", kind: "forestFire", region: "east-woods" },
      { type: "actOfGod", kind: "drought" },
      { type: "actOfGod", kind: "priceShock", good: "copper", magnitude: 0.4 },
      { type: "godPower", kind: "lightning", minerId: "m010" },
      { type: "godPower", kind: "boon", minerId: "m020", amount: 1000 },
      { type: "godPower", kind: "throw", minerId: "m030" },
      { type: "setDial", key: "interestRate", value: 0.05 },
      { type: "setDial", key: "bunkhouseRent", value: 30 },
    ];
    for (const seed of ["chaos-1", "chaos-2", "chaos-3"]) {
      const rng = keyedRng(seed, "plan");
      const plan: Record<number, OverseerAction[]> = {};
      for (let s = 0; s < 150; s++) if (rng.chance(0.15)) plan[s] = [rng.pick(kinds)];
      const { ctx, state } = createWorld({ seed, map });
      // step() throws if the books don't balance, so finishing is the assertion.
      const res = runForward(ctx, state, { shifts: 150, plan });
      expect(checkInvariants(res.state)).toEqual([]);
    }
  });

  it("garbage intents become rest, get logged, and break nothing", () => {
    const { ctx, state } = createWorld({ seed: "garbage", map, population: 6 });
    const junk: Record<string, Intent> = {
      m001: { action: { type: "fly" } as never },
      m002: { action: { type: "dig", siteId: "farm-1" } },
      m003: { action: { type: "work", jobId: "J999" } },
      m004: { action: { type: "farm", siteId: "farm-9" } }, // a private plot
      m005: { action: { type: "chop", siteId: "forest-west" }, orders: [{ good: "gold", side: "sell", qty: 50, limit: 1 }, { good: "food", side: "buy", qty: -3, limit: Number.NaN }] },
      m006: null as never,
    };
    const res = step(ctx, state, { intents: junk, overseer: [] });
    const by = (id: string) => res.record.activities.find((a) => a.minerId === id)!;
    for (const id of ["m001", "m002", "m003", "m004"]) {
      expect(by(id).action).toBe("rest");
      expect(by(id).valid).toBe(false);
    }
    expect(by("m006").action).toBe("rest"); // no intent at all: just rests
    expect(by("m005").action).toBe("chop");
    expect(res.record.events.filter((e) => e.kind === "invalid-intent").length).toBeGreaterThanOrEqual(4);
    expect(checkInvariants(res.state)).toEqual([]);
  });
});

describe("Lane 2 hooks", () => {
  it("the social term feeds into well-being", () => {
    const { ctx, state } = createWorld({ seed: "social", map, population: 3 });
    const intents = decideAll(ctx, state, baselineBrain);
    const plain = step(ctx, state, { intents, overseer: [] }).state;
    const happy = step(ctx, state, { intents, overseer: [], social: { m001: 0.2 } }).state;
    expect(happy.miners[0].wellbeing).toBeCloseTo(plain.miners[0].wellbeing + 0.2, 3);
  });

  it("lightning is witnessed by miners nearby", () => {
    const { ctx, state } = createWorld({ seed: "witness", map });
    const res = step(ctx, state, { intents: decideAll(ctx, state, baselineBrain), overseer: [{ type: "godPower", kind: "lightning", minerId: "m001" }] });
    const strike = res.record.events.find((e) => e.kind === "god-power")!;
    expect(strike.witnesses).toContain("m001");
    expect(strike.witnesses!.length).toBeGreaterThan(1); // everyone starts at the bunkhouse
  });
});

describe("balance smoke test", () => {
  it("a short run with baseline brains stays healthy", () => {
    const { log } = recordRun(map, { seed: "smoke", population: 100 }, { shifts: 400 });
    const tail = log.metrics.slice(-100);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(tail.map((m) => m.hungryFrac))).toBeLessThan(0.1);
    expect(mean(tail.map((m) => m.meanWellbeing))).toBeGreaterThan(0.4);
    const report = balanceReport(log.metrics);
    const hard = report.checks.filter((c) => !c.soft && !c.pass).map((c) => c.name);
    expect(hard).toEqual([]);
  });
});
