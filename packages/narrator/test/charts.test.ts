// Dashboard chart explanations, tested on the real world engine and minds.
import { describe as group, expect, it } from "vitest";
import { ALPINE_VALLEY, type ShiftRecord } from "@motherlode/shared";
import { createWorld, defaultDials, runForward } from "@motherlode/sim";
import { fuzzyBrain, generatePopulation } from "@motherlode/agents";
import { CHARTS, ChartExplainer, LiveNarrator, chartFacts, checkNumbers, describe, type LlmClient } from "../src/index.js";

function run(shifts: number, plan: Parameters<typeof runForward>[2]["plan"], seed = "charts") {
  const { ctx, state } = createWorld({ seed, map: ALPINE_VALLEY, population: generatePopulation(seed, 60, 0) });
  const records: ShiftRecord[] = [];
  runForward(ctx, state, { shifts, brain: fuzzyBrain, plan, onShift: (r) => records.push(r) });
  return records;
}

const dials = { ...defaultDials() } as unknown as Record<string, number>;
const records = run(90, { 50: [{ type: "actOfGod", kind: "drought" }] });

function explainer(rs = records) {
  const ex = new ChartExplainer();
  for (const r of rs) ex.push(r);
  return ex;
}

const fake = (reply: string | ((prompt: string) => string)): LlmClient & { prompts: string[] } => {
  const prompts: string[] = [];
  return { prompts, async generate(p) { prompts.push(p); return typeof reply === "string" ? reply : reply(p); } };
};

group("chart explanations", () => {
  it("describes a line's shape: flat stretches and big moves, with shift numbers", () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    const ys = xs.map((i) => (i < 15 ? 20 : i < 18 ? 20 + (i - 14) * 8 : 44));
    const d = describe("Food price", xs, ys, "coins");
    expect(d.flats[0]).toMatchObject({ start: 0, end: 14, value: 20 });
    expect(d.moves[0]).toMatchObject({ start: 14, end: 17, from: 20, to: 44 });
    expect(d.facts.join(" ")).toContain("rose from 20 coins to 44 coins from shift 14 to 17");
  });

  it("explains every dashboard chart from real records, with the rules and today's numbers", async () => {
    const ex = explainer();
    for (const chart of Object.keys(CHARTS)) {
      const e = await ex.explain(chart, { dials });
      expect(e.writtenBy).toBe("template");
      expect(e.fromShift).toBe(0);
      expect(e.toShift).toBe(89);
      expect(e.whatItShows.length).toBeGreaterThan(20);
      expect(e.whatHappened.length).toBeGreaterThan(20);
      expect(e.why.length).toBeGreaterThan(0);
    }
    const food = await ex.explain("food-price", { dials });
    expect(food.whatItShows).toMatch(/food/i);
    expect(food.why.join(" ")).toMatch(/outside world/);
  });

  it("puts the drought into the facts for food", () => {
    const facts = chartFacts("food-price", CHARTS["food-price"], records.map((r) => r.metrics), records.flatMap((r) => r.events), { dials });
    expect(facts.lines.join("\n")).toContain("at shift 50, a drought began");
    expect(facts.lines.join("\n")).toMatch(/Miners farming: [\d.]+ then [\d.]+/);
  });

  it("uses the model's wording when every number is in the facts", async () => {
    const llm = fake(JSON.stringify({ whatItShows: "What food costs.", whatHappened: "It moved around.", why: ["A drought hit at shift 50, so less food grew."] }));
    const e = await explainer().explain("food-price", { dials, llm });
    expect(e.writtenBy).toBe("llm");
    expect(e.why).toEqual(["A drought hit at shift 50, so less food grew."]);
    expect(llm.prompts[0]).toContain("FACTS:");
    expect(llm.prompts[0]).toContain("drought");
  });

  it("falls back to the template when the model makes up a number, or fails", async () => {
    const problems: string[] = [];
    const liar = fake(JSON.stringify({ whatItShows: "What food costs.", whatHappened: "It hit 98765 coins.", why: ["Because."] }));
    const e = await explainer().explain("food-price", { dials, llm: liar, onProblem: (p) => problems.push(p) });
    expect(e.writtenBy).toBe("template");
    expect(problems[0]).toContain("98765");

    const broken: LlmClient = { async generate() { throw new Error("quota"); } };
    expect((await explainer().explain("gold-price", { dials, llm: broken })).writtenBy).toBe("template");
    expect((await explainer().explain("gold-price", { dials, llm: fake("not json") })).writtenBy).toBe("template");
  });

  it("asks the model once per chart per shift", async () => {
    const llm = fake(JSON.stringify({ whatItShows: "a", whatHappened: "b", why: ["c"] }));
    const ex = explainer();
    await Promise.all([ex.explain("debt", { dials, llm }), ex.explain("debt", { dials, llm })]);
    await ex.explain("debt", { dials, llm });
    expect(llm.prompts).toHaveLength(1);
  });

  it("forgets the future after a rewind, and says so when there's too little history", async () => {
    const ex = explainer();
    ex.rewind(40);
    expect((await ex.explain("food-price", { dials })).toShift).toBe(40);
    const short = await explainer(records.slice(0, 2)).explain("food-price", { dials });
    expect(short.whatHappened).toMatch(/only run 2 shifts/);
    await expect(ex.explain("nope", { dials })).rejects.toThrow(/unknown chart/);
  });

  it("only allows numbers that appear in the facts", () => {
    expect(checkNumbers("It rose from 20 to 46 at shift 50, in 3 steps.", "from 20 coins to 46 coins at shift 50")).toEqual([]);
    expect(checkNumbers("It rose to 47.", "to 46 coins")).toHaveLength(1);
  });

  it("is reachable through the live narrator, which sees every shift", async () => {
    const narrator = new LiveNarrator();
    for (const r of records.slice(0, 30)) await narrator.push(r);
    const e = await narrator.explainChart("activity", dials);
    expect(e.toShift).toBe(29);
    expect(e.title).toBe("What the town is doing");
  });
});
