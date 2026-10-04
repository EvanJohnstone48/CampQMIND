import { describe, expect, it } from "vitest";
import type { Observation } from "@motherlode/shared";
import { PLACEHOLDER_MAP, createWorld, observeAll, step } from "@motherlode/sim";
import { compareBrains, createAgents } from "./agents";
import { fuzzyBrain, fuzzyDecide } from "./fuzzyBrain";
import { geminiClient, type LlmClient, type LlmRequest } from "./llm/gemini";
import { LlmMind, type LlmTrace } from "./llm/llmMind";
import { listOptions } from "./options";
import { generatePopulation, traitsOf } from "./population";

function town(seed = "agents", count = 20) {
  const population = generatePopulation(seed, count, 0);
  const { ctx, state } = createWorld({ seed, map: PLACEHOLDER_MAP, population });
  return { ctx, state, obs: observeAll(ctx, state) };
}

/** An observation with some needs overridden. */
function obsWith(base: Observation, self: Partial<Observation["self"]>, extra: Partial<Observation> = {}): Observation {
  return { ...base, ...extra, self: { ...base.self, ...self, needs: { ...base.self.needs, ...self.needs } } };
}

describe("population", () => {
  it("is the same for the same seed and different for another", () => {
    expect(generatePopulation("a", 30)).toEqual(generatePopulation("a", 30));
    expect(generatePopulation("a", 30)).not.toEqual(generatePopulation("b", 30));
  });

  it("gives everyone a unique name, personality, look and bio", () => {
    const pop = generatePopulation("names", 100);
    expect(new Set(pop.map((p) => p.name)).size).toBe(100);
    for (const p of pop) {
      const t = traitsOf(p.traits);
      expect(t.bio.length).toBeGreaterThan(20);
      expect(t.personality.boldness).toBe(p.riskAppetite);
      expect(t.look.hue).toBeGreaterThanOrEqual(0);
    }
  });

  it("hands the LLM brain to the requested share", () => {
    const count = (share: number) => generatePopulation("share", 100, share).filter((p) => traitsOf(p.traits).brain === "llm").length;
    expect(count(0.25)).toBe(25);
    expect(count(0)).toBe(0);
    expect(count(1)).toBe(100);
  });
});

describe("fuzzy brain", () => {
  it("rests when exhausted, and says which rule made it", () => {
    const { obs } = town();
    const tired = obsWith(obs.m001, { needs: { ...obs.m001.self.needs, energy: 0.02 } });
    const rests = Array.from({ length: 10 }, (_, i) => fuzzyDecide({ ...tired, shift: i }));
    expect(rests.filter((d) => d.intent.action.type === "rest").length).toBeGreaterThanOrEqual(8);
    expect(rests[0].trace.fired.some((f) => f.rule === "tired")).toBe(true);
    expect(rests[0].trace.inputs.energy[0]).toBe("low");
  });

  it("works when fresh and broke", () => {
    const { obs } = town();
    const broke = obsWith(obs.m002, { cash: 5, needs: { ...obs.m002.self.needs, energy: 1 } });
    const choices = Array.from({ length: 10 }, (_, i) => fuzzyBrain({ ...broke, shift: i }).action.type);
    expect(choices.filter((c) => c !== "rest").length).toBeGreaterThanOrEqual(8);
  });

  it("only ever picks something on the menu", () => {
    const { obs } = town();
    for (const o of Object.values(obs)) {
      const keys = listOptions(o).map((x) => JSON.stringify(x.action));
      expect(keys).toContain(JSON.stringify(fuzzyBrain(o).action));
    }
  });

  it("runs a town for 100 shifts with almost no invalid intents", () => {
    let { ctx, state } = town("valid", 60);
    let invalid = 0;
    for (let i = 0; i < 100; i++) {
      const obs = observeAll(ctx, state);
      const intents = Object.fromEntries(Object.entries(obs).map(([id, o]) => [id, fuzzyBrain(o)]));
      const res = step(ctx, state, { intents, overseer: [] });
      invalid += res.record.events.filter((e) => e.kind === "invalid-intent").length;
      state = res.state;
    }
    expect(invalid / (100 * 60)).toBeLessThan(0.02); // a few "job already filled" races are fine
  });
});

// ---------------------------------------------------------------- LLM

function fakeClient(answer: (req: LlmRequest) => unknown, delayMs = 0): LlmClient & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    model: "gemini-2.5-flash-lite",
    requests,
    async generate(req, signal) {
      requests.push(req);
      if (delayMs) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, delayMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        });
      }
      return { text: JSON.stringify(answer(req)), inputTokens: 400, outputTokens: 60 };
    },
  };
}

/** A model that always picks the first non-rest option it's offered. */
const firstWork = (req: LlmRequest) => {
  const keys = ((req.schema.properties as Record<string, { enum?: string[] }>).choice.enum ?? []).filter((k) => k !== "rest");
  return { choice: keys[0] ?? "rest", spend: 0, borrow: 0, repay: 0, thought: "Honest work today." };
};

describe("LLM mind", () => {
  it("does what the model picks, with its reasoning in the trace", async () => {
    const { obs } = town();
    const client = fakeClient(firstWork);
    const mind = new LlmMind({ client });
    const out = await mind.decide([obs.m001]);
    const trace = out.m001.trace as LlmTrace;
    expect(trace.source).toBe("llm");
    expect(trace.thought).toBe("Honest work today.");
    expect(out.m001.action.type).not.toBe("rest");
    expect(client.requests[0].user).toContain("Options:");
    expect(client.requests[0].system).toContain(obs.m001.self.name);
  });

  it("follows its plan between calls instead of asking every shift", async () => {
    const { obs } = town();
    const client = fakeClient(firstWork);
    const mind = new LlmMind({ client, replanEvery: 5 });
    await mind.decide([obs.m001]);
    const next = await mind.decide([{ ...obs.m001, shift: 1 }]);
    expect(client.requests).toHaveLength(1);
    expect((next.m001.trace as LlmTrace).source).toBe("plan");
    expect(mind.stats().planFollowed).toBe(1);
  });

  it("re-plans immediately when something notable happens", async () => {
    const { obs } = town();
    const client = fakeClient(firstWork);
    const mind = new LlmMind({ client, replanEvery: 50 });
    await mind.decide([obs.m001]);
    const quake = { id: "1:0", shift: 1, kind: "act-of-god" as const, text: "The ground shakes." };
    await mind.decide([{ ...obs.m001, shift: 1, witnessed: [quake] }]);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1].user).toContain("The ground shakes.");
  });

  it("stays inside its requests-per-minute budget and falls back to fuzzy", async () => {
    const { obs } = town();
    const client = fakeClient(firstWork);
    const mind = new LlmMind({ client, rpm: 3, now: () => 0 });
    const out = await mind.decide(Object.values(obs));
    expect(client.requests).toHaveLength(3);
    const sources = Object.values(out).map((i) => (i.trace as LlmTrace).source);
    expect(sources.filter((s) => s === "llm")).toHaveLength(3);
    expect(sources.filter((s) => s === "fuzzy")).toHaveLength(Object.keys(obs).length - 3);
  });

  it("falls back to fuzzy when the model is too slow or talks nonsense", async () => {
    const { obs } = town();
    const slow = new LlmMind({ client: fakeClient(firstWork, 500), timeoutMs: 20 });
    const out = await slow.decide([obs.m001]);
    expect((out.m001.trace as LlmTrace).source).toBe("fuzzy");
    expect(slow.stats().timedOut).toBe(1);

    const silly = new LlmMind({ client: fakeClient(() => ({ choice: "fly to the moon", spend: 0, borrow: 0, repay: 0, thought: "" })) });
    const out2 = await silly.decide([obs.m001]);
    expect((out2.m001.trace as LlmTrace).source).toBe("fuzzy");
    expect(silly.stats().invalid).toBe(1);
  });

  it("keeps the miner solvent whatever the model says", async () => {
    const { obs } = town();
    const mind = new LlmMind({ client: fakeClient((req) => ({ ...firstWork(req), spend: 1_000_000, borrow: 1_000_000, repay: 1_000_000 })) });
    const out = await mind.decide([obs.m001]);
    const i = out.m001;
    expect(i.spendOnComforts ?? 0).toBeLessThan(obs.m001.self.cash);
    expect(i.borrow ?? 0).toBeLessThanOrEqual(obs.m001.bank.myLimit);
    expect(i.repay).toBeUndefined(); // no debt to repay
  });

  it("counts tokens and estimates paid-tier cost", async () => {
    const { obs } = town();
    const mind = new LlmMind({ client: fakeClient(firstWork) });
    await mind.decide([obs.m001, obs.m002]);
    const s = mind.stats();
    expect(s.inputTokens).toBe(800);
    expect(s.outputTokens).toBe(120);
    expect(s.estimatedUsd).toBeCloseTo((800 * 0.1 + 120 * 0.4) / 1e6, 9);
  });
});

describe("Gemini client", () => {
  it("sends the key in a header and asks for JSON of the given shape", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 } }));
    }) as unknown as typeof fetch;
    const client = geminiClient({ apiKey: "test-key", model: "gemini-2.5-flash-lite", fetchImpl });
    const res = await client.generate({ system: "sys", user: "hi", schema: { type: "OBJECT" } });
    expect(res).toEqual({ text: '{"ok":1}', inputTokens: 12, outputTokens: 3 });
    expect(seen!.url).toContain("gemini-2.5-flash-lite:generateContent");
    expect(seen!.url).not.toContain("test-key");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(seen!.init.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toEqual({ type: "OBJECT" });
  });

  it("turns HTTP errors into exceptions", async () => {
    const fetchImpl = (async () => new Response("quota exceeded", { status: 429 })) as unknown as typeof fetch;
    const client = geminiClient({ apiKey: "k", fetchImpl });
    await expect(client.generate({ system: "", user: "", schema: {} })).rejects.toThrow(/429/);
  });
});

describe("the town", () => {
  it("is all fuzzy without an LLM, and a quarter LLM with one", async () => {
    expect(createAgents({ seed: "t", count: 40 }).population.every((p) => traitsOf(p.traits).brain === "fuzzy")).toBe(true);
    const agents = createAgents({ seed: "t", count: 40, llm: fakeClient(firstWork), llmOptions: { now: () => 0 } });
    expect(agents.population.filter((p) => traitsOf(p.traits).brain === "llm")).toHaveLength(10);

    const { ctx, state } = createWorld({ seed: "t", map: PLACEHOLDER_MAP, population: agents.population });
    const intents = await agents.decideAll(observeAll(ctx, state));
    expect(Object.keys(intents)).toHaveLength(40);
    expect(agents.llmStats()?.calls).toBeGreaterThan(0);
  });

  it("compares fuzzy and LLM miners head to head", () => {
    const base = { name: "", location: "", destination: "", activity: "rest", needs: {} as never, home: "bunkhouse" as const, injured: false };
    const scores = compareBrains([
      { ...base, id: "a", brain: "fuzzy", cash: 100, debt: 0, wellbeing: 0.5 },
      { ...base, id: "b", brain: "fuzzy", cash: 300, debt: 50, wellbeing: 0.7 },
      { ...base, id: "c", brain: "llm", cash: 500, debt: 0, wellbeing: 0.9 },
    ]);
    expect(scores.fuzzy).toEqual({ miners: 2, meanCash: 200, meanDebt: 25, meanWellbeing: 0.6 });
    expect(scores.llm.miners).toBe(1);
  });
});

describe("LLM options", () => {
  it("keeps defaults for options left undefined (e.g. unset .env values)", async () => {
    const { obs } = town();
    const client = fakeClient(firstWork);
    const mind = new LlmMind({ client, rpm: undefined, timeoutMs: undefined, now: () => 0 });
    await mind.decide(Object.values(obs));
    expect(client.requests.length).toBe(10); // default rpm
  });
});
