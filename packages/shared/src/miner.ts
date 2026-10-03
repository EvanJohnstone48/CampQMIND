import type { Inventory } from "./goods";

/** Productivity multipliers, roughly 0.5 (clumsy) to 1.5 (expert). */
export interface Skills {
  mining: number;
  chopping: number;
  farming: number;
  smelting: number;
  building: number;
}

/**
 * Who a miner is at the start. Lane 2's population generator produces these;
 * the sim has a simple default generator so it can run on its own.
 */
export interface MinerSeed {
  id: string;
  name: string;
  skills: Skills;
  /** 0 = very careful, 1 = reckless. Brains use it; the sim doesn't. */
  riskAppetite: number;
  /** Anything else Lane 2 wants to attach (personality, face...). Carried through untouched. */
  traits?: Record<string, unknown>;
}

/** Every need is 0 (desperate) to 1 (fully met). Well-being is built from these. */
export interface Needs {
  nourishment: number;
  energy: number;
  shelter: number;
  health: number;
  security: number;
  /** Small pleasures bought from outside (whiskey, tobacco, good boots). Decays each shift. */
  comfort: number;
}

export type HomeKind = "house" | "bunkhouse" | "rough";

export interface LoanView {
  id: string;
  balance: number;
  ratePerDay: number;
  installment: number;
  missed: number;
  dueDay: number;
  collateralSiteId?: string;
}

/** What a miner knows about themselves. */
export interface MinerView {
  id: string;
  name: string;
  location: string;
  home: { kind: HomeKind; siteId?: string };
  skills: Skills;
  riskAppetite: number;
  traits?: Record<string, unknown>;
  needs: Needs;
  wellbeing: number;
  cash: number;
  inventory: Inventory;
  debt: number;
  loans: LoanView[];
  creditBarredUntilDay: number;
  injuredUntilShift: number;
  employment?: { jobId: string; employerId: string; wage: number };
  ownedSites: string[];
  /** Ore per dig the miner last got at each vein they've worked. Grade is hidden; this is how they learn it. */
  veinYield: Record<string, number>;
  /** Coins earned last shift (sales + wages). */
  lastIncome: number;
  lastAction: string;
}

/** A compact view of a miner for the browser and the narrator. */
export interface MinerPublic {
  id: string;
  name: string;
  location: string;
  /** Where they're walking to this shift. */
  destination: string;
  activity: string;
  cash: number;
  debt: number;
  wellbeing: number;
  needs: Needs;
  home: HomeKind;
  injured: boolean;
  employerId?: string;
}
