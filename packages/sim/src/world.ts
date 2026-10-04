// The full world state. Plain JSON-serialisable data, so snapshots, forks and replays are just copies.

import {
  GOODS,
  emptyInventory,
  keyedRng,
  type Good,
  type HomeKind,
  type Inventory,
  type MinerSeed,
  type Needs,
  type PriceView,
  type Skills,
  type WorkTask,
  type WorldEvent,
  type WorldMap,
  type ShiftMetrics,
} from "@motherlode/shared";
import { defaultDials, type Dials } from "./dials";
import { loadMap, siteCapacity, travelMatrix } from "./map";
import { defaultPopulation } from "./population";
import { ORE_FACTOR } from "./tradingPost";

/** Anything that holds cash and goods. */
export interface Holder {
  cash: number;
  inventory: Inventory;
}

export interface MinerState extends Holder {
  id: string;
  name: string;
  skills: Skills;
  riskAppetite: number;
  traits?: Record<string, unknown>;
  location: string;
  destination: string;
  needs: Needs;
  wellbeing: number;
  social: number;
  homeKind: HomeKind;
  homeSiteId?: string;
  injuredUntilShift: number;
  collapsed: boolean;
  creditBarredUntilDay: number;
  jobId?: string;
  veinYield: Record<string, number>;
  lastIncome: number;
  /** Income of the last 6 shifts, newest last; the bank looks at this. */
  incomeHistory: number[];
  lastAction: string;
}

export interface VeinState {
  siteId: string;
  ore: "copper" | "gold";
  /** Total units that can ever come out. Hidden. */
  tonnage: number;
  extracted: number;
  /** Hidden: richness at the surface, how fast it thins with depth, and rock hardness. */
  grade0: number;
  gradeScale: number;
  hardness0: number;
  depth: number;
  supportedDepth: number;
  exhausted: boolean;
  /** A gold-rush pocket: extra-rich ore until `remaining` units are dug. */
  pocket?: { remaining: number; multiplier: number; sourceEventId: string };
}

export interface ForestState {
  siteId: string;
  capacity: number;
  stock: number;
  depleted: boolean;
}

export interface FarmState {
  siteId: string;
  fertility: number;
  commons: boolean;
  ownerId?: string;
}

export interface SmelterState {
  siteId: string;
  ownerId?: string;
  fee: number;
}

export interface LotState {
  siteId: string;
  ownerId?: string;
  progress: number;
  required: number;
  complete: boolean;
}

export interface Job {
  id: string;
  employerId: string;
  siteId: string;
  task: WorkTask;
  wage: number;
  openings: number;
  hiredLastShift: number;
  arrears: number;
  postedShift: number;
}

export interface Loan {
  id: string;
  borrowerId: string;
  principal: number;
  balance: number;
  ratePerDay: number;
  termDays: number;
  issuedDay: number;
  missed: number;
  collateralSiteId?: string;
}

export interface BankState extends Holder {
  initialReserves: number;
  loans: Loan[];
  nextLoanId: number;
  lending: boolean;
}

export interface Modifier {
  kind: "earthquake" | "drought";
  /** Undefined = the whole valley. */
  region?: string;
  untilShift: number;
  magnitude: number;
  sourceEventId: string;
}

export interface WorldState {
  seed: string;
  mapId: string;
  /** The next shift to resolve. Shift s belongs to day floor(s / 2). */
  shift: number;
  dials: Dials;
  miners: MinerState[];
  veins: VeinState[];
  forests: ForestState[];
  farms: FarmState[];
  smelters: SmelterState[];
  lots: LotState[];
  jobs: Job[];
  nextJobId: number;
  bank: BankState;
  treasury: Holder;
  prices: Record<Good, PriceView>;
  worldPrices: Record<Good, number>;
  modifiers: Modifier[];
  /** Workers at each site last shift (public; crowding info for brains). */
  lastWorkers: Record<string, number>;
  /** What the books say the totals should be. Checked against actual holdings every shift. */
  ledger: { cash: number; goods: Inventory };
  /** Last shift's events, for witnesses' next observation. */
  recentEvents: WorldEvent[];
  lastMetrics?: ShiftMetrics;
}

export interface WorldSetup {
  startCash: number;
  startFood: number;
  startTimber: number;
  bankReserves: number;
  treasuryCash: number;
}

export const DEFAULT_SETUP: WorldSetup = {
  startCash: 400,
  startFood: 6,
  startTimber: 2,
  bankReserves: 20000,
  treasuryCash: 4000,
};

export interface WorldConfig {
  seed: string;
  map: WorldMap;
  /** Lane 2's population, or a head count for the default generator (100). */
  population?: MinerSeed[] | number;
  dials?: Partial<Dials>;
  setup?: Partial<WorldSetup>;
}

/** Static things derived from the map. Never changes during a run, so it isn't in WorldState. */
export interface SimContext {
  map: WorldMap;
  travel: Record<string, Record<string, number>>;
  sites: Record<string, WorldMap["sites"][number]>;
  capacity: Record<string, number>;
}

export function createContext(map: WorldMap): SimContext {
  loadMap(map);
  const sites: SimContext["sites"] = {};
  const capacity: Record<string, number> = {};
  for (const s of map.sites) {
    sites[s.id] = s;
    capacity[s.id] = siteCapacity(s);
  }
  return { map, travel: travelMatrix(map), sites, capacity };
}

const START_PRICES: Record<Good, number> = { food: 30, timber: 25, copperOre: 40, copper: 120, gold: 300 };

export function createWorld(config: WorldConfig): { ctx: SimContext; state: WorldState } {
  const ctx = createContext(config.map);
  const { seed, map } = config;
  const setup = { ...DEFAULT_SETUP, ...config.setup };
  const dials: Dials = { ...defaultDials() };
  for (const [k, v] of Object.entries(config.dials ?? {})) if (v !== undefined) dials[k] = v;

  const seeds =
    Array.isArray(config.population) ? config.population : defaultPopulation(seed, config.population ?? 100);
  const bunk = map.sites.find((s) => s.kind === "bunkhouse")!.id;
  const startRng = (id: string, n = 0) => keyedRng(seed, "start-needs", id, n);

  const miners: MinerState[] = [...seeds]
    .sort((a, b) => cmp(a.id, b.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      skills: { ...p.skills },
      riskAppetite: p.riskAppetite,
      ...(p.traits ? { traits: p.traits } : {}),
      location: bunk,
      destination: bunk,
      // Staggered start, so the town doesn't tire and rest in lockstep.
      needs: { nourishment: startRng(p.id).range(0.6, 1), energy: startRng(p.id, 1).range(0.4, 1), shelter: 0.6, health: 1, security: 0.4, comfort: 0.3 },
      wellbeing: 0,
      social: 0,
      homeKind: "bunkhouse" as HomeKind,
      injuredUntilShift: 0,
      collapsed: false,
      creditBarredUntilDay: 0,
      veinYield: {},
      lastIncome: 0,
      incomeHistory: [],
      lastAction: "rest",
      cash: setup.startCash,
      inventory: { ...emptyInventory(), food: setup.startFood, timber: setup.startTimber },
    }));

  const sitesOf = (kind: string) => map.sites.filter((s) => s.kind === kind).sort((a, b) => cmp(a.id, b.id));

  const veins: VeinState[] = sitesOf("vein").map((s) => {
    const rng = keyedRng(seed, "vein", s.id);
    const gold = s.ore === "gold";
    return {
      siteId: s.id,
      ore: gold ? "gold" : "copper",
      tonnage: gold ? rng.int(300, 600) : rng.int(5000, 9000),
      extracted: 0,
      grade0: rng.range(0.75, 1.25),
      gradeScale: rng.range(20, 35),
      hardness0: rng.range(0.85, 1.25),
      depth: 0,
      supportedDepth: 0,
      exhausted: false,
    };
  });

  const forests: ForestState[] = sitesOf("forest").map((s) => ({ siteId: s.id, capacity: 600, stock: 450, depleted: false }));

  // Private farm plots and the smelter start with owners, picked from the seed.
  const ownerRng = keyedRng(seed, "owners");
  const ownerPool = ownerRng.shuffle(miners.map((m) => m.id));
  let nextOwner = 0;
  const takeOwner = () => (nextOwner < ownerPool.length ? ownerPool[nextOwner++] : undefined);

  const farms: FarmState[] = sitesOf("farm").map((s) => {
    const commons = s.commons === true;
    return { siteId: s.id, fertility: 1, commons, ownerId: commons ? undefined : takeOwner() };
  });
  const smelters: SmelterState[] = sitesOf("smelter").map((s) => ({ siteId: s.id, ownerId: takeOwner(), fee: 8 }));
  const lots: LotState[] = sitesOf("houseLot").map((s) => ({ siteId: s.id, progress: 0, required: dials.houseLabour, complete: false }));

  const prices = {} as Record<Good, PriceView>;
  for (const g of GOODS) prices[g] = { last: START_PRICES[g], volume: 0 };

  const state: WorldState = {
    seed,
    mapId: map.id,
    shift: 0,
    dials,
    miners,
    veins,
    forests,
    farms,
    smelters,
    lots,
    jobs: [],
    nextJobId: 1,
    bank: { cash: setup.bankReserves, inventory: emptyInventory(), initialReserves: setup.bankReserves, loans: [], nextLoanId: 1, lending: true },
    treasury: { cash: setup.treasuryCash, inventory: emptyInventory() },
    prices,
    worldPrices: worldBasePrices(dials),
    modifiers: [],
    lastWorkers: {},
    ledger: { cash: 0, goods: emptyInventory() },
    recentEvents: [],
  };
  const totals = actualTotals(state);
  state.ledger = { cash: totals.cash, goods: totals.goods };
  return { ctx, state };
}

export function worldBasePrices(dials: Dials): Record<Good, number> {
  return {
    food: dials.worldFoodPrice,
    timber: dials.worldTimberPrice,
    copperOre: dials.worldCopperPrice * ORE_FACTOR,
    copper: dials.worldCopperPrice,
    gold: dials.worldGoldPrice,
  };
}

/** Cash and goods actually held by everyone in the valley. */
export function actualTotals(state: WorldState): { cash: number; goods: Inventory } {
  const goods = emptyInventory();
  let cash = state.bank.cash + state.treasury.cash;
  const add = (inv: Inventory) => {
    for (const g of GOODS) goods[g] += inv[g];
  };
  for (const m of state.miners) {
    cash += m.cash;
    add(m.inventory);
  }
  add(state.bank.inventory);
  add(state.treasury.inventory);
  return { cash, goods };
}

export function dayOf(shift: number): number {
  return Math.floor(shift / 2);
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function findMiner(state: WorldState, id: string): MinerState | undefined {
  return state.miners.find((m) => m.id === id);
}
