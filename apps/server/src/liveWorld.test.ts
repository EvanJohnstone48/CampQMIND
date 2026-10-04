import { describe, expect, it } from "vitest";
import { PLACEHOLDER_MAP, hashState, replayRun } from "@motherlode/sim";
import { baselineProvider } from "./brains";
import { LiveWorld } from "./liveWorld";

const make = () => new LiveWorld({ seed: "live", map: PLACEHOLDER_MAP, population: 40, roundMs: 1000, brains: baselineProvider });

describe("live world", () => {
  it("ticks shifts and streams updates", async () => {
    const w = make();
    const msg = await w.tick();
    expect(msg?.type).toBe("shift");
    if (msg?.type === "shift") {
      expect(msg.update.shift).toBe(0);
      expect(msg.update.miners).toHaveLength(40);
      expect(msg.update.metrics.population).toBe(40);
    }
    expect(w.state.shift).toBe(1);
  });

  it("applies Overseer actions on the next shift", async () => {
    const w = make();
    w.handle({ type: "overseer", action: { type: "godPower", kind: "boon", minerId: "m001", amount: 999 } });
    const msg = await w.tick();
    expect(msg?.type === "shift" && msg.update.events.some((e) => e.kind === "god-power")).toBe(true);
  });

  it("reverts to exactly the world it was at that shift", async () => {
    const w = make();
    const hashes: string[] = [];
    for (let i = 0; i < 25; i++) {
      await w.tick();
      hashes.push(hashState(w.state));
    }
    w.handle({ type: "revert", toShift: 12 });
    expect(w.state.shift).toBe(13);
    expect(hashState(w.state)).toBe(hashes[12]);
    // ...and carries on from there.
    await w.tick();
    expect(w.state.shift).toBe(14);
  });

  it("saves a run that replays to the same world", async () => {
    const w = make();
    w.handle({ type: "overseer", action: { type: "actOfGod", kind: "goldRush" } });
    for (let i = 0; i < 15; i++) await w.tick();
    const log = w.runLog();
    expect(hashState(replayRun(JSON.parse(JSON.stringify(log))).state)).toBe(log.finalHash);
  });

  it("answers fork requests with both branches", () => {
    const w = make();
    const { reply } = w.handle({ type: "fork", requestId: "q1", shifts: 5, actions: [{ type: "actOfGod", kind: "drought" }] });
    expect(reply?.type).toBe("forkResult");
    if (reply?.type === "forkResult") {
      expect(reply.baseline).toHaveLength(5);
      expect(reply.variant).toHaveLength(5);
    }
  });

  it("pauses, resumes and changes speed", () => {
    const w = make();
    expect(w.handle({ type: "pause" }).broadcast).toMatchObject({ type: "status", status: { paused: true } });
    expect(w.handle({ type: "speed", roundMs: 50 }).broadcast).toMatchObject({ status: { roundMs: 100 } });
    expect(w.handle({ type: "resume" }).broadcast).toMatchObject({ status: { paused: false } });
  });
});

describe("live world with the narrator", () => {
  it("sends cards with shifts, and rewinds the narrator with the world", async () => {
    const { LiveNarrator } = await import("@motherlode/narrator");
    const narrator = new LiveNarrator();
    const w = new LiveWorld({ seed: "narr", map: PLACEHOLDER_MAP, population: 40, roundMs: 1000, brains: baselineProvider, narrator });
    let cards = 0;
    const tick = async () => {
      const msg = await w.tick();
      if (msg?.type === "shift") cards += msg.update.cards.length;
    };
    // The narrator needs ~16 shifts of history to know what normal looks like.
    for (let i = 0; i < 20; i++) await tick();
    w.handle({ type: "overseer", action: { type: "godPower", kind: "boon", minerId: "m001", amount: 20000 } });
    for (let i = 0; i < 15; i++) await tick();
    const hello = w.hello();
    expect(hello.type === "hello" && hello.cards.length).toBe(cards);
    expect(cards).toBeGreaterThan(0);
    expect(w.hello().type === "hello" && (w.hello() as { cards: { headline: string }[] }).cards.some((c) => /money/i.test(c.headline))).toBe(true);
    const { broadcast } = w.handle({ type: "revert", toShift: 10 });
    expect(broadcast?.type === "reverted" && broadcast.cards.every((c) => c.round <= 10)).toBe(true);
  });
});
