// The Lane 1 adapter, tested on the real world engine and minds.
import { describe, expect, it } from "vitest";
import { ALPINE_VALLEY, type ShiftRecord } from "@motherlode/shared";
import { createWorld, runForward } from "@motherlode/sim";
import { fuzzyBrain, generatePopulation } from "@motherlode/agents";
import { LiveNarrator, MOTHERLODE_CONFIG, toRoundSnapshot } from "../src/index.js";

function run(shifts: number, plan: Parameters<typeof runForward>[2]["plan"], seed = "narrate") {
  const { ctx, state } = createWorld({ seed, map: ALPINE_VALLEY, population: generatePopulation(seed, 100, 0) });
  const records: ShiftRecord[] = [];
  runForward(ctx, state, { shifts, brain: fuzzyBrain, plan, onShift: (r) => records.push(r) });
  return records;
}

describe("the Motherlode adapter", () => {
  it("maps every watched metric and keeps only notable events as suspects", () => {
    const [r] = run(1, { 0: [{ type: "actOfGod", kind: "drought" }, { type: "setDial", key: "interestRate", value: 0.02 }] });
    const snap = toRoundSnapshot(r);
    for (const k of Object.keys(MOTHERLODE_CONFIG.metrics)) expect(Number.isFinite(snap.metrics[k])).toBe(true);
    expect(snap.events).toEqual([
      { kind: "drought", round: 0, source: "overseer" },
      { kind: "dial:interestRate", round: 0, source: "overseer" },
    ]);
    expect(Object.keys(snap.ruleFirings ?? {}).length).toBeGreaterThan(0);
  });

  it("only names events and links the config actually defines", () => {
    const known = new Set(Object.keys(MOTHERLODE_CONFIG.eventLabels ?? {}));
    for (const e of MOTHERLODE_CONFIG.knownEffects ?? []) {
      expect(known.has(e.event)).toBe(true);
      expect(MOTHERLODE_CONFIG.metrics[e.metric]).toBeDefined();
    }
    for (const l of MOTHERLODE_CONFIG.knownLinks ?? []) {
      expect(MOTHERLODE_CONFIG.metrics[l.from]).toBeDefined();
      expect(MOTHERLODE_CONFIG.metrics[l.to]).toBeDefined();
    }
  });

  it("explains a real gold rush, naming it as the likely cause", async () => {
    const records = run(140, { 100: [{ type: "actOfGod", kind: "goldRush", siteId: "gold-2" }] });
    const n = new LiveNarrator();
    const cards = [];
    for (const r of records) cards.push(...(await n.push(r)));
    const rush = cards.filter((c) => c.round >= 100 && c.statements.some((s) => /gold rush/.test(s.text)));
    expect(rush.length).toBeGreaterThan(0);
    expect(rush.some((c) => c.confidence === "likely")).toBe(true);
  });

  it("forgets the future when the world is rewound", async () => {
    const records = run(140, { 100: [{ type: "actOfGod", kind: "goldRush", siteId: "gold-2" }] });
    const n = new LiveNarrator();
    for (const r of records) await n.push(r);
    expect(n.cards().some((c) => c.round > 100)).toBe(true);
    n.rewind(99);
    expect(n.cards().every((c) => c.round <= 99)).toBe(true);
  });
});
