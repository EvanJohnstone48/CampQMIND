import { describe, expect, it } from "vitest";
import type { WorldMap } from "@motherlode/shared";
import { MapError, loadMap, travelMatrix, validateMap } from "./map";
import { PLACEHOLDER_MAP } from "./placeholderMap";

const clone = (): WorldMap => structuredClone(PLACEHOLDER_MAP);

describe("map loader", () => {
  it("accepts the placeholder valley", () => {
    expect(validateMap(PLACEHOLDER_MAP)).toEqual([]);
    expect(loadMap(PLACEHOLDER_MAP)).toBe(PLACEHOLDER_MAP);
  });

  it("ignores rendering extras Lane 4 adds", () => {
    const m = clone();
    m.extras = { mountains: [1, 2, 3] };
    m.sites[0].extras = { colour: "red" };
    expect(validateMap(m)).toEqual([]);
  });

  it("reports duplicate ids", () => {
    const m = clone();
    m.sites.push({ ...m.sites[0] });
    expect(validateMap(m).join()).toMatch(/duplicate id/);
  });

  it("reports unknown kinds and veins without ore", () => {
    const m = clone();
    m.sites.push({ id: "castle", kind: "castle" as never, name: "Castle", position: { x: 0, z: 0 } });
    const v = m.sites.find((s) => s.kind === "vein")!;
    delete v.ore;
    const problems = validateMap(m).join("\n");
    expect(problems).toMatch(/unknown kind "castle"/);
    expect(problems).toMatch(/veins need ore/);
  });

  it("reports trails to sites that don't exist", () => {
    const m = clone();
    m.trails.push({ from: "market", to: "atlantis", travel: 0.1 });
    expect(validateMap(m).join()).toMatch(/unknown site "atlantis"/);
  });

  it("requires every kind of site the economy needs", () => {
    const m = clone();
    m.sites = m.sites.filter((s) => s.kind !== "smelter");
    m.trails = m.trails.filter((t) => t.to !== "smelter" && t.from !== "smelter");
    expect(validateMap(m).join()).toMatch(/at least one "smelter"/);
  });

  it("reports sites you can't walk to", () => {
    const m = clone();
    m.trails = m.trails.filter((t) => t.to !== "bank" && t.from !== "bank");
    expect(validateMap(m).join()).toMatch(/"bank" can't be reached/);
  });

  it("throws a MapError listing every problem", () => {
    expect(() => loadMap({ id: "", sites: [], trails: [] })).toThrow(MapError);
  });

  it("finds shortest walking times through the trail network", () => {
    const d = travelMatrix(PLACEHOLDER_MAP);
    const direct = PLACEHOLDER_MAP.trails.find((t) => t.from === "market" && t.to === "copper-1")!.travel;
    expect(d["copper-1"]["market"]).toBe(direct);
    expect(d["copper-1"]["copper-2"]).toBeLessThanOrEqual(d["copper-1"]["market"] + d["market"]["copper-2"]);
  });
});
