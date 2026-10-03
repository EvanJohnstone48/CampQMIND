// A simple default population so the sim can run without Lane 2.
// Lane 2's generator replaces this by passing its own MinerSeed[] to createWorld.

import { keyedRng, type MinerSeed, type Skills } from "@motherlode/shared";

const FIRST = ["Ada", "Bram", "Cora", "Dell", "Edda", "Finn", "Greta", "Hollis", "Ivo", "Jun", "Kit", "Lark", "Mabel", "Nils", "Ottie", "Pip", "Quill", "Rosa", "Silas", "Tamsin", "Ugo", "Vera", "Wes", "Yara", "Zeke"];
const LAST = ["Cobb", "Flint", "Marsh", "Penn", "Rook", "Slate", "Thorne", "Vane", "Wick", "Ashby", "Bell", "Cragg"];

const SKILL_KEYS: (keyof Skills)[] = ["mining", "chopping", "farming", "smelting", "building"];

export function defaultPopulation(seed: string, count: number): MinerSeed[] {
  const out: MinerSeed[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const rng = keyedRng(seed, "population", i);
    let name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    while (used.has(name)) name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    used.add(name);
    const skills = {} as Skills;
    for (const k of SKILL_KEYS) skills[k] = round2(rng.range(0.6, 1.2));
    const specialty = rng.pick(SKILL_KEYS);
    skills[specialty] = round2(Math.min(1.5, skills[specialty] * 1.3));
    out.push({ id: `m${String(i + 1).padStart(3, "0")}`, name, skills, riskAppetite: round2(rng.next()) });
  }
  return out;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
