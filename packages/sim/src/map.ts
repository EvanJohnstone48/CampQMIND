// Loads and checks the one map Lane 4 authors. The sim never generates a map.

import type { MapSite, SiteKind, WorldMap } from "@motherlode/shared";

const SITE_KINDS: SiteKind[] = ["vein", "forest", "farm", "smelter", "bank", "market", "tradingPost", "bunkhouse", "houseLot"];
const REQUIRED_KINDS: SiteKind[] = ["vein", "forest", "farm", "smelter", "bank", "market", "tradingPost", "bunkhouse", "houseLot"];

export const DEFAULT_CAPACITY: Record<SiteKind, number> = {
  vein: 6,
  forest: 8,
  farm: 4,
  smelter: 4,
  bank: 100,
  market: 100,
  tradingPost: 100,
  bunkhouse: 100,
  houseLot: 3,
};

export class MapError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid map:\n- ${problems.join("\n- ")}`);
    this.name = "MapError";
  }
}

/** Returns every problem with the map (empty if it's fine). */
export function validateMap(map: unknown): string[] {
  const problems: string[] = [];
  const m = map as Partial<WorldMap>;
  if (!m || typeof m !== "object") return ["map is not an object"];
  if (typeof m.id !== "string" || !m.id) problems.push("map.id must be a non-empty string");
  if (!Array.isArray(m.sites)) return [...problems, "map.sites must be an array"];
  if (!Array.isArray(m.trails)) return [...problems, "map.trails must be an array"];

  const ids = new Set<string>();
  m.sites.forEach((s: Partial<MapSite>, i) => {
    const where = `site #${i} (${s?.id ?? "no id"})`;
    if (typeof s.id !== "string" || !s.id) problems.push(`${where}: id must be a non-empty string`);
    else if (ids.has(s.id)) problems.push(`${where}: duplicate id`);
    else ids.add(s.id);
    if (!SITE_KINDS.includes(s.kind as SiteKind)) problems.push(`${where}: unknown kind "${s.kind}"`);
    if (!s.position || !Number.isFinite(s.position.x) || !Number.isFinite(s.position.z)) {
      problems.push(`${where}: position needs numeric x and z`);
    }
    if (s.kind === "vein" && s.ore !== "copper" && s.ore !== "gold") problems.push(`${where}: veins need ore "copper" or "gold"`);
    if (s.capacity !== undefined && !(Number.isInteger(s.capacity) && s.capacity > 0)) {
      problems.push(`${where}: capacity must be a positive integer`);
    }
  });

  for (const kind of REQUIRED_KINDS) {
    if (!m.sites.some((s) => s.kind === kind)) problems.push(`map needs at least one "${kind}" site`);
  }

  m.trails.forEach((t, i) => {
    if (!ids.has(t.from)) problems.push(`trail #${i}: unknown site "${t.from}"`);
    if (!ids.has(t.to)) problems.push(`trail #${i}: unknown site "${t.to}"`);
    if (!Number.isFinite(t.travel) || t.travel < 0) problems.push(`trail #${i}: travel must be a number >= 0`);
  });

  if (problems.length === 0) {
    const travel = travelMatrix(m as WorldMap);
    const first = m.sites[0].id;
    for (const s of m.sites) {
      if (!Number.isFinite(travel[first][s.id])) problems.push(`site "${s.id}" can't be reached by trail from "${first}"`);
    }
  }
  return problems;
}

/** Throws a MapError listing every problem, or returns the map. */
export function loadMap(map: unknown): WorldMap {
  const problems = validateMap(map);
  if (problems.length) throw new MapError(problems);
  return map as WorldMap;
}

/** Shortest walking time between every pair of sites (Floyd-Warshall; maps are small). */
export function travelMatrix(map: WorldMap): Record<string, Record<string, number>> {
  const ids = map.sites.map((s) => s.id);
  const d: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    d[a] = {};
    for (const b of ids) d[a][b] = a === b ? 0 : Infinity;
  }
  for (const t of map.trails) {
    if (t.travel < d[t.from][t.to]) {
      d[t.from][t.to] = t.travel;
      d[t.to][t.from] = t.travel;
    }
  }
  for (const k of ids) for (const i of ids) for (const j of ids) {
    const via = d[i][k] + d[k][j];
    if (via < d[i][j]) d[i][j] = via;
  }
  return d;
}

export function siteCapacity(site: MapSite): number {
  return site.capacity ?? DEFAULT_CAPACITY[site.kind];
}
