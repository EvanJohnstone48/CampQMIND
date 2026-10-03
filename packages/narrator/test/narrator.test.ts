import { describe, expect, it } from "vitest";
import { createNarrator, makeScenario, type EvidencePackage, type LlmClient } from "../src/index.js";
import { Gate } from "../src/gate.js";
import { DEFAULT_SETTINGS } from "../src/types.js";

const scenario = makeScenario("gold-rush");

/** Plays the scenario and returns the first non-empty step's cards. */
async function firstCards(llm?: LlmClient, onProblem?: (m: string) => void) {
  const narrator = createNarrator(scenario.config, { llm, llmTimeoutMs: 50, onProblem });
  for (let i = 1; i <= scenario.history.length; i++) {
    const cards = await narrator.step(scenario.history.slice(0, i));
    if (cards.length) return cards;
  }
  throw new Error("no cards");
}

/** A fake model that echoes the templates back, optionally edited. */
function fakeLlm(edit: (s: string) => string = (s) => s): LlmClient {
  return {
    async generate(prompt) {
      const input = JSON.parse(prompt.slice(prompt.indexOf("Input:") + "Input:".length));
      return JSON.stringify({
        headline: edit(input.headline),
        statements: input.statements.map((s: { text: string }) => edit(s.text)),
      });
    },
  };
}

describe("model wording", () => {
  it("uses the model's wording when it passes the checks", async () => {
    const [card] = await firstCards(fakeLlm((s) => s.replace("came just before", "happened right before")));
    expect(card.writtenBy).toBe("llm");
    expect(card.statements.some((s) => s.text.includes("happened right before"))).toBe(true);
  });

  it("falls back to templates when the model invents a number", async () => {
    const problems: string[] = [];
    const [card] = await firstCards(fakeLlm((s) => s.replace("{{metric}}", "{{metric}} (about 40 coins)")), (m) => problems.push(m));
    expect(card.writtenBy).toBe("template");
    expect(problems.join()).toMatch(/number/);
  });

  it("falls back to templates when the model is slow, fails or returns junk", async () => {
    const slow: LlmClient = { generate: (_, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) };
    const broken: LlmClient = { generate: async () => { throw new Error("quota"); } };
    const junk: LlmClient = { generate: async () => "Sure! Here you go." };
    for (const llm of [slow, broken, junk]) {
      const [card] = await firstCards(llm);
      expect(card.writtenBy).toBe("template");
    }
  });
});

describe("narrator", () => {
  it("never throws into the caller's loop", async () => {
    const problems: string[] = [];
    const narrator = createNarrator({ metrics: { x: { label: "x", format: "number" } } }, { onProblem: (m) => problems.push(m) });
    await expect(narrator.step(null as never)).resolves.toEqual([]);
    expect(problems).toHaveLength(1);
  });

  it("only suggests a configured lever", async () => {
    const narrator = createNarrator({
      ...scenario.config,
      levers: [{ metric: "goldPrice", direction: "down", text: "end the gold rush early" }],
    });
    let suggested: string | undefined;
    for (let i = 1; i <= scenario.history.length && !suggested; i++) {
      const [card] = await narrator.step(scenario.history.slice(0, i));
      suggested = card?.statements.find((s) => s.kind === "suggested")?.text;
    }
    expect(suggested).toBe("You could end the gold rush early.");
  });
});

describe("gate", () => {
  const pkg = (over: Partial<EvidencePackage>): EvidencePackage => ({
    id: "x", round: 24, topic: "goldPrice", direction: "down", startRound: 21, confidence: "likely",
    priority: 1, headline: "", statements: [], slots: {}, evidence: [], ...over,
  });

  it("shows a change once, then again only when its story changes", () => {
    const gate = new Gate(DEFAULT_SETTINGS);
    expect(gate.select([pkg({})])).toHaveLength(1);
    expect(gate.select([pkg({ round: 25, startRound: 22 })])).toHaveLength(0); // same change, start re-estimated
    expect(gate.select([pkg({ round: 26, confidence: "possibly" })])).toHaveLength(1);
    expect(gate.select([pkg({ round: 27, confidence: "possibly", direction: "up" })])).toHaveLength(1);
    expect(gate.select([pkg({ round: 40, confidence: "possibly", direction: "up", startRound: 36 })])).toHaveLength(1);
  });

  it("caps cards per shift, biggest first", () => {
    const picked = new Gate(DEFAULT_SETTINGS).select([
      pkg({ topic: "a", priority: 0.2 }), pkg({ topic: "b", priority: 0.9 }), pkg({ topic: "c", priority: 0.5 }),
    ]);
    expect(picked.map((p) => p.topic)).toEqual(["b", "c"]);
  });
});
