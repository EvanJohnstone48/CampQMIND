// The map is authored by Lane 4 (one fixed valley) and loaded by the sim (Lane 1).
// It is purely geographic: hidden things like vein grade and hardness come from the seed.
// Lane 4 may add rendering-only data under `extras`; the sim ignores it.

export type SiteKind =
  | "vein" // a mine entrance on a mountain; `ore` says copper or gold
  | "forest" // a patch of forest to chop
  | "farm" // a farm plot
  | "smelter" // turns copper ore + timber into copper
  | "bank"
  | "market" // the market square where auctions happen
  | "tradingPost" // the link to the outside world
  | "bunkhouse" // rented beds for miners with no house
  | "houseLot"; // an empty lot a miner can build a house on

export interface MapSite {
  id: string;
  kind: SiteKind;
  name: string;
  /** Ground-plane position in world units (x east, z south). Lane 4 picks the height. */
  position: { x: number; z: number };
  /** How many workers fit before crowding cuts everyone's output. */
  capacity?: number;
  /** Veins only. */
  ore?: "copper" | "gold";
  /** Named area used by regional acts of god ("north-ridge", "east-woods"...). */
  region?: string;
  /** Farms only: true if the plot is town commons that anyone can farm. */
  commons?: boolean;
  extras?: Record<string, unknown>;
}

export interface MapTrail {
  from: string;
  to: string;
  /** Walking time as a fraction of one shift (0.1 = a tenth of the shift spent walking). */
  travel: number;
}

export interface WorldMap {
  id: string;
  name: string;
  version: number;
  sites: MapSite[];
  trails: MapTrail[];
  /** How far (world units) a miner can see an act of god or god power happen. */
  sightRadius?: number;
  extras?: Record<string, unknown>;
}
