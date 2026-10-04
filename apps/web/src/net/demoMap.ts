import type { BuildingView, Point } from './world.ts';

/** Authored display layout; capacity describes the demo's physical layout only. */
export const demoHomes: readonly BuildingView[] = Array.from({ length: 24 }, (_, i) => ({
  id: `home-${i}`, name: `${['Birch', 'Edelweiss', 'Pine', 'Larch', 'Juniper', 'Alder'][i % 6]} chalet ${Math.floor(i / 6) + 1}`,
  kind: 'home', position: [-25 + i % 6 * 5, -3 + Math.floor(i / 6) * 6.5] as Point, capacity: 5,
  description: 'A family chalet with two floors, a balcony and five beds.',
}));
export const streetRoutes: readonly (readonly Point[])[] = [
  ...[ -0.9, 5.6, 12.1, 18.6 ].map(z => [[-28, z], [1.2, z]] as readonly Point[]),
  [[-28, -6], [-28, 22]], [[-2.5, -5], [-2.5, 21]],
];
export const siteCapacities: Record<string, number> = { town: 120, copper: 40, gold: 28, forest: 24, farm: 24, smelter: 28 };

export interface SiteFootprint {
  id: string; position: Point; minX: number; maxX: number; minZ: number; maxZ: number; elevation: number; feather: number;
}
/** Entire model extents plus clearance, rather than just each site's center. */
export const siteFootprints: readonly SiteFootprint[] = [
  { id: 'town', position: [-9, 0], minX: -20.5, maxX: 10.5, minZ: -10.5, maxZ: 23, elevation: 0.94, feather: 8 },
  { id: 'copper', position: [-12, -12], minX: -7.5, maxX: 10.5, minZ: -7, maxZ: 6, elevation: 0.94, feather: 7 },
  { id: 'gold', position: [15, -12], minX: -7.5, maxX: 10.5, minZ: -7, maxZ: 6, elevation: 0.94, feather: 7 },
  { id: 'forest', position: [-27, 23], minX: -7.5, maxX: 5, minZ: -5.5, maxZ: 5.5, elevation: 0.94, feather: 6 },
  { id: 'farm', position: [17, 13], minX: -5.5, maxX: 9.5, minZ: -6.5, maxZ: 6, elevation: 0.94, feather: 6 },
  { id: 'smelter', position: [12, -1], minX: -5.5, maxX: 10.5, minZ: -6.5, maxZ: 7, elevation: 0.94, feather: 6 },
  { id: 'pasture', position: [-22, 28], minX: -5.5, maxX: 6.5, minZ: -4, maxZ: 5.5, elevation: 0.94, feather: 5 },
  { id: 'shelter-west', position: [-49, 42], minX: -1.9, maxX: 3.8, minZ: -1.9, maxZ: 2.2, elevation: 3.5, feather: 5 },
  { id: 'shelter-east', position: [38, 38], minX: -1.9, maxX: 3.8, minZ: -1.9, maxZ: 2.2, elevation: 4.5, feather: 5 },
];
export function footprintDistance(x: number, z: number, site: SiteFootprint) {
  return Math.hypot(Math.max(site.minX - (x - site.position[0]), x - site.position[0] - site.maxX, 0),
    Math.max(site.minZ - (z - site.position[1]), z - site.position[1] - site.maxZ, 0));
}
export function sceneryClearance(x: number, z: number, padding = 1.5) {
  return siteFootprints.some(site => footprintDistance(x, z, site) < padding);
}
export const mineEntrances = [-4.2, 0, 4.2] as const;
export const millrace: readonly Point[] = [[5.4 + Math.sin(-7 * 0.17) * 1.2, -7], [7.6, -7], [7.6, 2], [5.4 + Math.sin(7 * 0.17) * 1.2, 7]];
export const sceneryTrails: readonly (readonly Point[])[] = [
  [[-2.5, 18.6], [-2.5, 21], [-7, 22], [-10.5, 25]],
  [[-28, 22], [-35, 32], [-42, 38], [-49, 42]],
  [[22, 18], [27, 23], [32, 31], [38, 38]],
];

export function residentRoute(i: number, destination: string): readonly Point[] {
  const home = demoHomes[i % demoHomes.length];
  const door: Point = [home.position[0], home.position[1] + 1.9];
  const streetZ = home.position[1] + 2.1;
  const ends: Record<string, Point> = { copper: [-12, -12], gold: [15, -12], forest: [-27, 23], farm: [17, 13], smelter: [12, -1] };
  const end = ends[destination];
  const station: Point = [end[0] + (i % 7 - 3) * 0.65, end[1] + 2.1 + Math.floor(i / 7) % 4 * 0.6];
  if (destination === 'forest') return [door, [door[0], streetZ], [-28, streetZ], [-28, 22], end, station];
  if (destination === 'copper') return [door, [door[0], streetZ], [-2.5, streetZ], [-2.5, -0.9], [-9, -0.9], [-13, -7], end, station];
  const approach: Point = destination === 'gold' ? [12, -6] : destination === 'farm' ? [12, 9] : [10, 4];
  return [door, [door[0], streetZ], [-2.5, streetZ], [-2.5, 4], [8, 4], approach, end, station];
}
