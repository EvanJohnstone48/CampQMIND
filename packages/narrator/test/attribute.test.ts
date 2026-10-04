import { describe, expect, it } from "vitest";
import { attribute, type Suspect } from "../src/attribute.js";
import type { Development } from "../src/detect.js";
import { DEFAULT_SETTINGS, type KnownEffect, type RoundSnapshot, type WorldEvent } from "../src/types.js";

const dev: Development = {
  metric: "goldPrice",
  direction: "down",
  startRound: 21,
  round: 24,
  usual: 12,
  now: 9,
  spread: 0.5,
  size: 5,
  strength: "strong",
  stillMoving: true,
};

function run(events: WorldEvent[], knownEffects: KnownEffect[] = []) {
  const history: RoundSnapshot[] = Array.from({ length: 25 }, (_, round) => ({
    round,
    metrics: {},
    events: events.filter((e) => e.round === round),
  }));
  const config = { metrics: { goldPrice: { label: "the gold price", format: "coins" as const } }, knownEffects };
  return attribute(dev, { history, config, settings: DEFAULT_SETTINGS });
}

const kind = (s: Suspect | null) => (s?.type === "event" ? s.event.kind : undefined);

const rush: KnownEffect = { event: "goldRush", metric: "goldPrice", direction: "down" };

describe("attribute", () => {
  it("one known cause just before → likely", () => {
    const a = run([{ kind: "goldRush", round: 20 }], [rush]);
    expect([a.reason, a.confidence, kind(a.top)]).toEqual(["known-sole", "likely", "goldRush"]);
  });

  it("two known causes just before → possibly, naming both", () => {
    const a = run([{ kind: "goldRush", round: 20 }, { kind: "quake", round: 19 }], [rush, { event: "quake", metric: "goldPrice" }]);
    expect([a.reason, a.confidence]).toEqual(["known-shared", "possibly"]);
    expect([a.top, ...a.others].map(kind).sort()).toEqual(["goldRush", "quake"]);
  });

  it("a rival known cause just outside the window still blocks 'likely'", () => {
    const a = run([{ kind: "goldRush", round: 20 }, { kind: "quake", round: 22 }], [rush, { event: "quake", metric: "goldPrice" }]);
    expect(a.confidence).toBe("possibly");
  });

  it("a known effect in the wrong direction doesn't count", () => {
    const a = run([{ kind: "goldRush", round: 20 }], [{ ...rush, direction: "up" }]);
    expect([a.reason, a.confidence]).toEqual(["timing-only", "possibly"]);
  });

  it("one event with no known link → possibly (may be coincidence)", () => {
    expect(run([{ kind: "lightning", round: 20 }]).confidence).toBe("possibly");
  });

  it("several events with no known link → unclear, no cause named", () => {
    const a = run([{ kind: "lightning", round: 20 }, { kind: "boon", round: 19 }]);
    expect([a.reason, a.confidence, a.top]).toEqual(["timing-shared", "unclear", null]);
  });

  it("nothing just before → unclear", () => {
    expect(run([{ kind: "goldRush", round: 10 }], [rush]).reason).toBe("none");
  });

  it("an event after the change began is not a suspect", () => {
    expect(run([{ kind: "goldRush", round: 23 }], [rush]).reason).toBe("none");
  });

  it("never says more than 'likely' without a counterfactual re-run", () => {
    expect(run([{ kind: "goldRush", round: 21 }], [rush]).confidence).not.toBe("almost certainly");
  });
});

describe("chains", () => {
  it("traces a change through a linked change back to its event, only with configured links", async () => {
    const { analyze, makeScenario } = await import("../src/index.js");
    const s = makeScenario("chain");
    const gold = (config: typeof s.config) =>
      analyze(s.history.slice(0, 26), config).find((p) => p.topic === "goldPrice")!;

    const linked = gold(s.config);
    expect(linked.statements.map((st) => st.kind)).toContain("chain");
    expect(linked.confidence).toBe("likely");

    const unlinked = gold({ ...s.config, knownLinks: [] });
    expect(unlinked.statements.map((st) => st.kind)).not.toContain("chain");
    expect(unlinked.confidence).not.toBe("likely");
  });
});
