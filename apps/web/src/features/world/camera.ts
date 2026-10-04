export const ACTIVE_BOUNDS = { minX: -40, maxX: 38, minZ: -23, maxZ: 43 };
export const OVERVIEW = { position: [30, 43, 42] as const, target: [-5, 7, 6] as const, fov: 60 };

export function boundedPoint(x: number, z: number) {
  return { x: Math.max(ACTIVE_BOUNDS.minX, Math.min(ACTIVE_BOUNDS.maxX, x)), z: Math.max(ACTIVE_BOUNDS.minZ, Math.min(ACTIVE_BOUNDS.maxZ, z)) };
}
