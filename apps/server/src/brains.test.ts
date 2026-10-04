import { describe, expect, it } from "vitest";
import { PLACEHOLDER_MAP } from "@motherlode/sim";
import { pickTown } from "./brains";
import { LiveWorld } from "./liveWorld";

describe("picking the town's brains", () => {
  it("defaults to Lane 2's fuzzy town when there's no Gemini key", async () => {
    const town = pickTown({}, "town", 30);
    expect(town.name).toBe("agents (fuzzy)");
    expect(Array.isArray(town.population) && town.population).toHaveLength(30);
    expect(town.llmStats()).toBeUndefined();
    const w = new LiveWorld({ seed: "town", map: PLACEHOLDER_MAP, population: town.population, roundMs: 1000, brains: town.brains, syncBrain: town.syncBrain });
    const msg = await w.tick();
    expect(msg?.type === "shift" && msg.update.miners.every((m) => m.brain === "fuzzy")).toBe(true);
    expect(msg?.type === "shift" && msg.update.activities.some((a) => (a.trace as { brain?: string })?.brain === "fuzzy")).toBe(true);
  });

  it("gives a quarter of the town to Gemini when a key is set", () => {
    const town = pickTown({ GEMINI_API_KEY: "not-a-real-key" }, "town", 40);
    expect(town.name).toContain("gemini");
    const brains = (town.population as { traits?: { brain?: string } }[]).map((p) => p.traits?.brain);
    expect(brains.filter((b) => b === "llm")).toHaveLength(10);
  });

  it("can still run the sim's baseline brain", () => {
    expect(pickTown({ BRAINS: "baseline" }, "town", 30)).toMatchObject({ name: "baseline", population: 30 });
  });
});
