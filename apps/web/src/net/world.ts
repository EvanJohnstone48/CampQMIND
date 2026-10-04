/** Frontend view model, not a proposed shared simulation contract.
 * Map lane 1 snapshots into this shape in a WorldSource adapter. */
export type Point = readonly [number, number]; // x, z in scene units
export type Trade = 'Miner' | 'Woodcutter' | 'Farmer' | 'Smelter' | 'Hauler';
export interface Place {
  id: string;
  name: string;
  kind: 'town' | 'copper' | 'gold' | 'forest' | 'farm' | 'smelter';
  position: Point;
  color: string;
}
export interface MinerView {
  id: string;
  name: string;
  trade: Trade;
  activity: string;
  position: Point;
  destinationId: string;
  working: boolean;
  color: string;
  homeId?: string;
  route?: readonly Point[];
}
export interface BuildingView {
  id: string;
  name: string;
  kind: 'home';
  position: Point;
  capacity: number;
  description: string;
}
export interface WorldView {
  sourceLabel: string;
  elapsed: number;
  hour: number;
  day: number;
  miners: readonly MinerView[];
  places: readonly Place[];
  buildings?: readonly BuildingView[];
}
export interface WorldSource {
  /** Must provide a full initial snapshot and then updated snapshots. */
  connect(publish: (world: WorldView) => void): () => void;
  /** Optional demo/playback control. Live adapters may omit this. */
  setPaused?(paused: boolean): void;
  setSpeed?(speed: number): void;
}

/** Pure route interpolation, shared by the demo and its checks. */
export function pointOnRoute(route: readonly Point[], fraction: number): Point {
  if (route.length === 0) return [0, 0];
  if (route.length === 1) return route[0];
  const lengths = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1]));
  let distance = Math.max(0, Math.min(1, fraction)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : distance / lengths[i];
      return [route[i][0] + (route[i + 1][0] - route[i][0]) * t,
        route[i][1] + (route[i + 1][1] - route[i][1]) * t];
    }
    distance -= lengths[i];
  }
  return route[route.length - 1];
}
