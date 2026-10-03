// A stand-in valley so Lane 1 can run before Lane 4's real map lands.
// Same shape as the real one; swap it out by passing Lane 4's map to createWorld.

import type { MapSite, MapTrail, WorldMap } from "@motherlode/shared";

const sites: MapSite[] = [
  { id: "market", kind: "market", name: "Market Square", position: { x: 0, z: 0 } },
  { id: "bank", kind: "bank", name: "Valley Bank", position: { x: 10, z: 5 } },
  { id: "bunkhouse", kind: "bunkhouse", name: "Bunkhouse", position: { x: -10, z: 6 } },
  { id: "trading-post", kind: "tradingPost", name: "Trading Post", position: { x: 0, z: 70 } },
  { id: "smelter", kind: "smelter", name: "Smelter", position: { x: 22, z: -12 }, capacity: 4 },

  { id: "copper-1", kind: "vein", name: "Red Seam", ore: "copper", region: "north-ridge", position: { x: -35, z: -70 } },
  { id: "copper-2", kind: "vein", name: "Old Glory", ore: "copper", region: "north-ridge", position: { x: -5, z: -82 } },
  { id: "copper-3", kind: "vein", name: "Widow's Drift", ore: "copper", region: "west-ridge", position: { x: -80, z: -30 } },
  { id: "copper-4", kind: "vein", name: "Bluestone", ore: "copper", region: "west-ridge", position: { x: -88, z: 12 } },
  { id: "gold-1", kind: "vein", name: "Sunrise Lode", ore: "gold", region: "east-peak", position: { x: 70, z: -72 }, capacity: 4 },
  { id: "gold-2", kind: "vein", name: "Magpie Hole", ore: "gold", region: "east-peak", position: { x: 92, z: -40 }, capacity: 4 },

  { id: "forest-west", kind: "forest", name: "West Woods", region: "west-woods", position: { x: -55, z: 25 } },
  { id: "forest-north", kind: "forest", name: "Pine Hollow", region: "north-woods", position: { x: -30, z: -40 } },
  { id: "forest-east", kind: "forest", name: "East Woods", region: "east-woods", position: { x: 60, z: 25 } },
];

for (let i = 1; i <= 10; i++) {
  sites.push({
    id: `farm-${i}`,
    kind: "farm",
    name: `Farm ${i}`,
    region: "riverside",
    commons: i <= 6,
    capacity: 5,
    position: { x: 32 + (i % 2) * 12, z: -36 + i * 7 },
  });
}

for (let i = 1; i <= 30; i++) {
  const row = Math.floor((i - 1) / 10);
  const col = (i - 1) % 10;
  sites.push({
    id: `lot-${String(i).padStart(2, "0")}`,
    kind: "houseLot",
    name: `Lot ${i}`,
    region: "village",
    position: { x: -36 + col * 8, z: 16 + row * 9 },
  });
}

const byId = new Map(sites.map((s) => [s.id, s]));
function walk(a: string, b: string): number {
  const p = byId.get(a)!.position;
  const q = byId.get(b)!.position;
  return Math.round((Math.hypot(p.x - q.x, p.z - q.z) / 400) * 1000) / 1000;
}

// Every site has a trail to the square; mines and woods also link to their neighbours and the smelter.
const trails: MapTrail[] = sites.filter((s) => s.id !== "market").map((s) => ({ from: "market", to: s.id, travel: walk("market", s.id) }));
const extraLinks: [string, string][] = [
  ["copper-1", "copper-2"], ["copper-3", "copper-4"], ["gold-1", "gold-2"],
  ["copper-1", "smelter"], ["copper-2", "smelter"], ["gold-1", "smelter"],
  ["forest-north", "copper-1"], ["forest-west", "copper-4"], ["forest-east", "farm-8"],
];
for (const [a, b] of extraLinks) trails.push({ from: a, to: b, travel: walk(a, b) });

export const PLACEHOLDER_MAP: WorldMap = {
  id: "placeholder-valley",
  name: "Placeholder Valley",
  version: 1,
  sightRadius: 40,
  sites,
  trails,
};
