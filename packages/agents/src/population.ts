// Who lives in the valley: names, personalities, skills, a look for the 3D beans, and which brain
// drives each miner. Fully seeded, so the same seed always gives the same town.

import { keyedRng, type MinerSeed, type Skills } from "@motherlode/shared";

export type BrainKind = "fuzzy" | "llm";

/** 0..1 each. They tilt the fuzzy rules and give the LLM a character to play. */
export interface Personality {
  /** Works through tiredness; rarely idles. */
  diligence: number;
  /** Takes risks: deep shafts, gold rumours, borrowing. */
  boldness: number;
  /** Saves rather than spends; keeps bigger stores. */
  thrift: number;
}

export interface MinerTraits {
  brain: BrainKind;
  personality: Personality;
  /** For Lane 4's beans. */
  look: { hue: number; hat: "none" | "cap" | "helmet" | "bowler" | "bandana" };
  /** One line for the Agents tab and the LLM's persona. */
  bio: string;
}

const FIRST = [
  "Ada", "Abel", "Bram", "Bess", "Cora", "Cyrus", "Dell", "Dora", "Edda", "Ezra", "Finn", "Flora", "Greta", "Gus",
  "Hollis", "Hattie", "Ivo", "Iris", "Jun", "Jo", "Kit", "Kasimir", "Lark", "Lottie", "Mabel", "Moss", "Nils", "Nell",
  "Ottie", "Orrin", "Pip", "Pearl", "Quill", "Rosa", "Rufus", "Silas", "Sadie", "Tamsin", "Theo", "Ugo", "Una", "Vera",
  "Vik", "Wes", "Wren", "Yara", "Yusuf", "Zeke", "Zelda",
];
const LAST = [
  "Cobb", "Flint", "Marsh", "Penn", "Rook", "Slate", "Thorne", "Vane", "Wick", "Ashby", "Bell", "Cragg", "Dunmore",
  "Ember", "Fenwick", "Gale", "Holloway", "Ingram", "Jessop", "Kettle", "Lowe", "Moorcroft", "Nettle", "Oakes",
  "Pickett", "Quarry", "Ridley", "Stack", "Tallow", "Underhill",
];
const HATS: MinerTraits["look"]["hat"][] = ["none", "cap", "helmet", "bowler", "bandana"];
const SKILL_KEYS: (keyof Skills)[] = ["mining", "chopping", "farming", "smelting", "building"];
const TRADE: Record<keyof Skills, string> = {
  mining: "a born digger",
  chopping: "handy with an axe",
  farming: "a patient farmer",
  smelting: "a smelter's eye for ore",
  building: "a careful builder",
};

/**
 * `llmShare` of the town (default a quarter) gets the LLM brain; the rest are fuzzy.
 * Pass 0 when there's no Gemini key.
 */
export function generatePopulation(seed: string, count: number, llmShare = 0.25): MinerSeed[] {
  const out: MinerSeed[] = [];
  const used = new Set<string>();
  const llmCount = Math.round(count * Math.max(0, Math.min(1, llmShare)));
  const llmIds = new Set(keyedRng(seed, "brains").shuffle([...Array(count).keys()]).slice(0, llmCount));

  for (let i = 0; i < count; i++) {
    const rng = keyedRng(seed, "miner", i);
    let name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    for (let tries = 0; used.has(name) && tries < 50; tries++) name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    if (used.has(name)) name = `${name} ${i}`;
    used.add(name);

    const skills = {} as Skills;
    for (const k of SKILL_KEYS) skills[k] = r2(rng.range(0.6, 1.2));
    const specialty = rng.pick(SKILL_KEYS);
    skills[specialty] = r2(Math.min(1.5, skills[specialty] * 1.3));

    const personality: Personality = { diligence: r2(rng.next()), boldness: r2(rng.next()), thrift: r2(rng.next()) };
    const traits: MinerTraits = {
      brain: llmIds.has(i) ? "llm" : "fuzzy",
      personality,
      look: { hue: rng.int(0, 359), hat: rng.pick(HATS) },
      bio: bio(name.split(" ")[0], specialty, personality),
    };
    out.push({
      id: `m${String(i + 1).padStart(3, "0")}`,
      name,
      skills,
      riskAppetite: personality.boldness,
      traits: traits as unknown as Record<string, unknown>,
    });
  }
  return out;
}

/** Reads Lane 2's traits back off a miner (falls back to a middling fuzzy miner). */
export function traitsOf(traits: Record<string, unknown> | undefined): MinerTraits {
  const t = traits as Partial<MinerTraits> | undefined;
  return {
    brain: t?.brain === "llm" ? "llm" : "fuzzy",
    personality: { diligence: 0.5, boldness: 0.5, thrift: 0.5, ...t?.personality },
    look: t?.look ?? { hue: 30, hat: "none" },
    bio: t?.bio ?? "",
  };
}

function bio(first: string, specialty: keyof Skills, p: Personality): string {
  const work = p.diligence > 0.66 ? "works from dawn to dusk" : p.diligence < 0.33 ? "likes a long lie-in" : "puts in an honest shift";
  const risk = p.boldness > 0.66 ? "chases every rumour" : p.boldness < 0.33 ? "never takes a chance" : "weighs the odds";
  const money = p.thrift > 0.66 ? "squirrels every coin away" : p.thrift < 0.33 ? "spends as fast as it comes" : "keeps a little by";
  return `${first} is ${TRADE[specialty]}, ${work}, ${risk} and ${money}.`;
}

function r2(x: number): number {
  return Math.round(x * 100) / 100;
}
