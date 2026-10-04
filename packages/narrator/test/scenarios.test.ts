import { describe, expect, it } from "vitest";
import { analyze, checkPackage, CONFIDENCE_SCALE, createNarrator, makeScenario, playScenario, scoreScenario, SCENARIO_NAMES } from "../src/index.js";
import { formatSlot } from "../src/format.js";

const SEEDS = 40;

// The main proof: against planted ground truth, the narrator finds the change,
// names the right suspects, and never sounds surer than the truth allows.
describe.each(SCENARIO_NAMES)("scenario %s", (name) => {
  it(`is right in at least 90% of ${SEEDS} seeds, never overclaims, rarely false-alarms`, async () => {
    let right = 0;
    let overclaimed = 0;
    let falseAlarms = 0;
    for (let i = 0; i < SEEDS; i++) {
      const scenario = makeScenario(name, `test-${i}`);
      const result = scoreScenario(scenario, await playScenario(scenario, createNarrator(scenario.config)));
      if (result.verdict === "right") right++;
      if (result.overclaimed) overclaimed++;
      falseAlarms += result.falseAlarms;
    }
    expect(overclaimed).toBe(0);
    expect(right / SEEDS).toBeGreaterThanOrEqual(0.9);
    expect(falseAlarms / SEEDS).toBeLessThanOrEqual(0.1);
  });

  it("gives the same cards for the same seed", async () => {
    const play = async () => {
      const s = makeScenario(name, "same");
      return playScenario(s, createNarrator(s.config));
    };
    expect(await play()).toEqual(await play());
  });
});

describe("every card", () => {
  const packages = SCENARIO_NAMES.flatMap((name) => {
    const s = makeScenario(name);
    return s.history.flatMap((_, i) => analyze(s.history.slice(0, i + 1), s.config));
  });

  it("is built from templates with no raw numbers and no missing placeholders", () => {
    expect(packages.length).toBeGreaterThan(0);
    for (const p of packages) expect(checkPackage(p)).toEqual([]);
  });

  it("only shows numbers that came from the data", async () => {
    for (const name of SCENARIO_NAMES) {
      const s = makeScenario(name);
      for (const card of await playScenario(s, createNarrator(s.config))) {
        const pkg = analyze(s.history.slice(0, card.round + 1), s.config).find((p) => p.id === card.id)!;
        // Lower-case: a slot at the start of a sentence is shown capitalised.
        let text = [card.headline, ...card.statements.map((st) => st.text)].join(" ").toLowerCase();
        // Longest first, so a short value (e.g. "3") can't break up a longer one that contains it.
        const values = Object.values(pkg.slots).map((v) => formatSlot(v).toLowerCase()).sort((a, b) => b.length - a.length);
        for (const v of values) text = text.split(v).join("");
        expect(text).not.toMatch(/\d/);
      }
    }
  });

  it("always says what it's unsure about, and leads any cause with a confidence word", () => {
    for (const p of packages) {
      expect(p.statements.some((s) => s.kind === "uncertain")).toBe(true);
      for (const s of p.statements.filter((s) => s.kind === "inferred")) {
        expect(CONFIDENCE_SCALE.some((c) => s.text.toLowerCase().startsWith(c))).toBe(true);
      }
    }
  });

  it("has one glance line at level 1, the why at level 2, and the reasoning at level 3", () => {
    for (const p of packages) {
      const at = (level: number) => p.statements.filter((s) => s.level === level).map((s) => s.kind);
      expect(at(1)).toEqual(["glance"]);
      expect(at(2)).toEqual(expect.arrayContaining(["observed", "uncertain"]));
      expect(at(3)).toEqual(expect.arrayContaining(["measure", "suspect", "reasoning"]));
    }
  });

  it("glance line states the card's confidence, or says the cause is unclear", () => {
    for (const p of packages) {
      const glance = p.statements.find((s) => s.kind === "glance")!.text.toLowerCase();
      expect(glance.includes(p.confidence === "unclear" ? "cause unclear" : p.confidence)).toBe(true);
    }
  });

  it("only suggests a lever when one is configured", () => {
    expect(packages.some((p) => p.statements.some((s) => s.kind === "suggested"))).toBe(false);
  });
});
