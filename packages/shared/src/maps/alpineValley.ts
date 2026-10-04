// The Alpine valley: the one map the world runs on, built from Lane 4's 3D valley.
//
// Every site sits inside the footprint Lane 4's terrain reserves for it (apps/web/src/net/demoMap.ts),
// so beans stand where the buildings are drawn. `extras.placeId` names the Lane 4 place a site belongs
// to; house lots reuse the chalet ids ("home-0".."home-23"). A web test checks the two stay in sync.

import type { MapSite, MapTrail, WorldMap } from "../map";

/** Lane 4's places: where each group of sites is drawn. */
export const VALLEY_PLACES = {
  town: [-9, 0],
  copper: [-12, -12],
  gold: [15, -12],
  forest: [-27, 23],
  farm: [17, 13],
  smelter: [12, -1],
} as const;

/** Offsets of the three tunnel mouths along each mine face (Lane 4's mineEntrances). */
const ENTRANCES = [-4.2, 0, 4.2];

function site(id: string, kind: MapSite["kind"], name: string, placeId: keyof typeof VALLEY_PLACES, x: number, z: number, more: Partial<MapSite> = {}): MapSite {
  return { id, kind, name, position: { x, z }, region: REGION[placeId], extras: { placeId }, ...more };
}

const REGION: Record<keyof typeof VALLEY_PLACES, string> = {
  town: "village",
  copper: "copper-ridge",
  gold: "goldpeak",
  forest: "timber-woods",
  farm: "sunfield",
  smelter: "riverside",
};

const [tx, tz] = VALLEY_PLACES.town;
const [cx, cz] = VALLEY_PLACES.copper;
const [gx, gz] = VALLEY_PLACES.gold;
const [fx, fz] = VALLEY_PLACES.forest;
const [ax, az] = VALLEY_PLACES.farm;
const [sx, sz] = VALLEY_PLACES.smelter;

const veinNames = { copper: ["Red Seam", "Old Glory", "Bluestone"], gold: ["Sunrise Lode", "Magpie Hole", "Eagle Drift"] };

const sites: MapSite[] = [
  site("market", "market", "Market square", "town", tx, tz),
  site("bank", "bank", "Valley bank", "town", tx + 2.4, tz - 1.2),
  site("bunkhouse", "bunkhouse", "Bunkhouse", "town", tx - 2.6, tz + 1.4),
  // The road out of the valley, past the village.
  site("trading-post", "tradingPost", "Trading post", "town", -2.5, 20.5),
  site("smelter", "smelter", "Riverside works", "smelter", sx, sz, { capacity: 4 }),
  ...ENTRANCES.map((dx, i) => site(`copper-${i + 1}`, "vein", veinNames.copper[i], "copper", cx + dx, cz, { ore: "copper", capacity: 8 })),
  ...ENTRANCES.map((dx, i) => site(`gold-${i + 1}`, "vein", veinNames.gold[i], "gold", gx + dx, gz, { ore: "gold", capacity: 5 })),
  site("forest-1", "forest", "Sawmill stand", "forest", fx - 3, fz - 1.5),
  site("forest-2", "forest", "Fir hollow", "forest", fx, fz + 3),
  site("forest-3", "forest", "Larch slope", "forest", fx + 3, fz - 2),
];

// Ten plots across Sunfield farm: the first six are commons.
for (let i = 0; i < 10; i++) {
  const col = i % 5;
  const row = Math.floor(i / 5);
  sites.push(site(`farm-${i + 1}`, "farm", `Sunfield plot ${i + 1}`, "farm", ax - 4 + col * 2.5, az - 2 + row * 4, { commons: i < 6, capacity: 5 }));
}

// The 24 chalets (same ids and positions as Lane 4's demoHomes) are the house lots.
const CHALET_NAMES = ["Birch", "Edelweiss", "Pine", "Larch", "Juniper", "Alder"];
for (let i = 0; i < 24; i++) {
  sites.push(site(`home-${i}`, "houseLot", `${CHALET_NAMES[i % 6]} chalet ${Math.floor(i / 6) + 1}`, "town", -25 + (i % 6) * 5, -3 + Math.floor(i / 6) * 6.5));
}

const byId = new Map(sites.map((s) => [s.id, s]));
/** Walking time: crossing the valley (~40 units) takes about a third of a shift. */
function walk(a: string, b: string): number {
  const p = byId.get(a)!.position;
  const q = byId.get(b)!.position;
  return Math.round((Math.hypot(p.x - q.x, p.z - q.z) / 120) * 1000) / 1000;
}

const trails: MapTrail[] = sites.filter((s) => s.id !== "market").map((s) => ({ from: "market", to: s.id, travel: walk("market", s.id) }));
const links: [string, string][] = [
  ["copper-1", "copper-2"], ["copper-2", "copper-3"], ["gold-1", "gold-2"], ["gold-2", "gold-3"],
  ["copper-3", "smelter"], ["gold-1", "smelter"], ["smelter", "farm-1"], ["forest-1", "forest-2"], ["forest-2", "forest-3"],
];
for (const [a, b] of links) trails.push({ from: a, to: b, travel: walk(a, b) });

export const ALPINE_VALLEY: WorldMap = {
  id: "alpine-valley",
  name: "The Alpine valley",
  version: 1,
  sightRadius: 9,
  sites,
  trails,
};
