/** Lane 4's procedural Alpine map. Shared by terrain, paths, props and feet. */
import { footprintDistance, millrace, siteFootprints } from '../../net/demoMap.ts';

const innerPeaks = [
  [-53, -43, 27, 42], [-31, -40, 23, 35], [-9, -42, 25, 49],
  [17, -39, 26, 41], [44, -42, 29, 51], [64, -27, 24, 35],
  [-36, -10, 19, 28], [35, -9, 20, 27], [-44, 18, 22, 24],
  [43, 23, 23, 27], [-15, -24, 14, 24], [17, -24, 14, 23],
  [-32, 55, 25, 18], [30, 58, 25, 22], [0, 92, 40, 42],
] as const;
type Peak = readonly [number, number, number, number];
// Three staggered ranges surround the valley through all 360 degrees.
export const peaks: readonly Peak[] = [...innerPeaks, ...[0, 1, 2].flatMap(layer =>
  Array.from({ length: layer === 0 ? 12 : 16 }, (_, i): Peak => {
    const angle = (i + layer * 0.37) / (layer === 0 ? 12 : 16) * Math.PI * 2;
    const distance = [104, 204, 304][layer] + Math.sin(i * 2.7 + layer) * [10, 16, 20][layer];
    return [Math.cos(angle) * distance, Math.sin(angle) * distance, [43, 77, 108][layer] + hash(i + layer * 31) * 9,
      [43, 72, 90][layer] + hash(i + layer * 19 + 58) * 30];
  }))];

export const terrainSegments = 256;
export const terrainRadii: readonly number[] = (() => {
  const rings = [0];
  for (let r = 0.7; r <= 38; r += 0.7) rings.push(r);
  for (let r = 40; r <= 80; r += 2.5) rings.push(r);
  for (let r = 85; r <= 120; r += 5) rings.push(r);
  for (let r = 132; r <= 432; r += 12) rings.push(r);
  return rings;
})();

// The stream bends beside the east-facing chalets, keeping their foundations dry.
export function riverX(z: number) { return 5.4 + Math.sin(z * 0.17) * 1.2; }
export function riverY(z: number) { return 0.69 + Math.max(0, -z - 17) * 0.62; }
export function lakeEdgeScale(angle: number) { return 1 + Math.sin(angle * 3) * 0.075 + Math.cos(angle * 5) * 0.045; }
export function lakeDistance(x: number, z: number) {
  return Math.hypot(x / 12, (z - 32) / 10) / lakeEdgeScale(Math.atan2((z - 32) / 10, x / 12));
}
export function terrainHeight(x: number, z: number) {
  const distant = smoothstep(40, 85, Math.hypot(x, z));
  let height = 0.88 + Math.sin(x * 0.2) * Math.cos(z * 0.17) * 0.24 + Math.sin(x * 0.7 + z * 0.41) * 0.07
    + distant * (3 + Math.sin(x * 0.035) * Math.cos(z * 0.029) * 2.7);
  height = Math.max(0.8, height);
  for (const [px, pz, radius, elevation] of peaks) {
    const dx = (x - px) * 0.93, dz = (z - pz) * 1.08;
    if (dx * dx + dz * dz >= radius * radius * 1.2544) continue;
    const angle = Math.atan2(z - pz, x - px);
    const ruggedRadius = radius * (1 + 0.12 * Math.sin(angle * 5 + px));
    const distance = Math.hypot(dx, dz);
    height = Math.max(height, 0.8 + elevation * Math.pow(Math.max(0, 1 - distance / ruggedRadius), 1.25));
  }
  // Union of full foundations: neighboring pads cannot reintroduce a mountain
  // into an already cleared site. Feathered edges become natural foothills.
  let clearance = 0;
  let foundation = 0.94;
  for (const site of siteFootprints) {
    if (x < site.position[0] + site.minX - site.feather - 2.5 || x > site.position[0] + site.maxX + site.feather + 2.5 ||
      z < site.position[1] + site.minZ - site.feather - 2.5 || z > site.position[1] + site.maxZ + site.feather + 2.5) continue;
    // Coarse triangles can span past a footprint edge; a guard band keeps their
    // interpolation below every wall and doorway as well as the analytic field.
    const influence = 1 - smoothstep(0, site.feather, Math.max(0, footprintDistance(x, z, site) - 2.5));
    if (influence > clearance) { clearance = influence; foundation = site.elevation; }
  }
  height = height * (1 - clearance) + foundation * clearance;
  // Glacial lake and the stream cut into the meadow instead of lying on top of it.
  const lake = lakeDistance(x, z);
  if (lake < 1.14) height = Math.min(height, 0.72 - (1.14 - lake) * 2);
  else if (lake < 1.3) height = 0.72 * (1 - smoothstep(1.14, 1.3, lake)) + height * smoothstep(1.14, 1.3, lake);
  const distanceToRiver = Math.abs(x - riverX(z));
  if (z > -25 && z < 34 && distanceToRiver < 2.8) {
    // A flat stream bed wide enough for the terrain's triangles keeps land from
    // poking through the water at bends; the outer bank blends into the meadow.
    const bank = Math.max(0, Math.min(1, (distanceToRiver - 1.3) / 1.5));
    const blend = bank * bank * (3 - 2 * bank);
    height = height * blend + (riverY(z) - 0.3) * (1 - blend);
  }
  const channelDistance = millraceDistance(x, z);
  if (channelDistance < 0.95) {
    const bank = smoothstep(0.48, 0.95, channelDistance);
    height = height * bank + 0.39 * (1 - bank);
  }
  return height;
}

export function millraceDistance(x: number, z: number) {
  if (x < 3.2 || x > 8.6 || z < -8 || z > 8) return Infinity;
  let distance = Infinity;
  for (let i = 1; i < millrace.length; i++) distance = Math.min(distance, segmentDistance(x, z, millrace[i - 1], millrace[i]));
  return distance;
}

function smoothstep(a: number, b: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const terrainVertices = new Map<number, readonly [number, number, number]>();
/** Static shared vertices make repeated miner-foot queries inexpensive. */
export function terrainVertex(ring: number, sector: number): readonly [number, number, number] {
  const wrapped = ring === 0 ? 0 : sector % terrainSegments;
  const key = ring * terrainSegments + wrapped;
  const cached = terrainVertices.get(key);
  if (cached) return cached;
  const angle = wrapped / terrainSegments * Math.PI * 2;
  const x = Math.cos(angle) * terrainRadii[ring], z = Math.sin(angle) * terrainRadii[ring];
  const vertex = [x, terrainHeight(x, z), z] as const;
  terrainVertices.set(key, vertex);
  return vertex;
}

/** Height on the actual triangles, used to seat props on coarse distant ground. */
export function terrainSurfaceHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  if (radius < 0.00001) return terrainHeight(0, 0);
  const step = Math.PI * 2 / terrainSegments;
  const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
  const sector = Math.floor(angle / step);
  const polygonRadius = radius * Math.cos(angle - (sector + 0.5) * step) / Math.cos(step / 2);
  const outer = terrainRadii.findIndex(r => r >= polygonRadius);
  if (outer < 1) return terrainHeight(x, z);
  const a = terrainVertex(outer - 1, sector), b = terrainVertex(outer, sector);
  const c = terrainVertex(outer - 1, sector + 1), d = terrainVertex(outer, sector + 1);
  function interpolate(p: readonly number[], q: readonly number[], r: readonly number[]) {
    const denominator = (q[2] - r[2]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[2] - r[2]);
    if (Math.abs(denominator) < 1e-10) return null;
    const u = ((q[2] - r[2]) * (x - r[0]) + (r[0] - q[0]) * (z - r[2])) / denominator;
    const v = ((r[2] - p[2]) * (x - r[0]) + (p[0] - r[0]) * (z - r[2])) / denominator;
    const w = 1 - u - v;
    return Math.min(u, v, w) >= -0.00001 ? u * p[1] + v * q[1] + w * r[1] : null;
  }
  return interpolate(a, c, b) ?? interpolate(b, c, d) ?? terrainHeight(x, z);
}

export function walkHeight(x: number, z: number) {
  return Math.abs(z - 4) < 0.95 && x > 1.5 && x < 8.5 ? 1.18 : terrainSurfaceHeight(x, z);
}

export function hash(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function segmentDistance(x: number, z: number, a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0]; const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
