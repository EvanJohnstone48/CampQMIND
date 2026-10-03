// What miners, the browser and the narrator get to see. Hidden things (vein grade,
// hardness, tonnage) never leave the sim; miners learn them only by digging.

import {
  GOODS,
  type EventKind,
  type Good,
  type JobView,
  type MinerPublic,
  type MinerView,
  type Observation,
  type SiteView,
  type WorldEvent,
  type WorldSnapshot,
} from "@motherlode/shared";
import { bankRate, installment, loanLimit, minerDebt } from "./bank";
import { exportPrice, importPrice } from "./tradingPost";
import { dayOf, type MinerState, type SimContext, type WorldState } from "./world";

/** Events everyone hears about, even without seeing them. */
const PUBLIC_KINDS = new Set<EventKind>(["act-of-god", "rumour", "dial-changed", "credit-freeze", "credit-thaw", "price-move", "vein-exhausted"]);

export function siteViews(ctx: SimContext, state: WorldState, from?: string): SiteView[] {
  return ctx.map.sites.map((site) => {
    const v: SiteView = {
      id: site.id,
      kind: site.kind,
      name: site.name,
      travel: from ? round3(ctx.travel[from]?.[site.id] ?? 0) : 0,
      capacity: ctx.capacity[site.id],
      workersLastShift: state.lastWorkers[site.id] ?? 0,
    };
    switch (site.kind) {
      case "vein": {
        const vein = state.veins.find((x) => x.siteId === site.id)!;
        v.ore = vein.ore;
        v.depth = vein.depth;
        v.unsupportedDepth = Math.max(0, vein.depth - vein.supportedDepth);
        v.exhausted = vein.exhausted;
        break;
      }
      case "forest": {
        const f = state.forests.find((x) => x.siteId === site.id)!;
        v.stockFraction = round3(f.stock / f.capacity);
        break;
      }
      case "farm": {
        const f = state.farms.find((x) => x.siteId === site.id)!;
        v.fertility = round3(f.fertility);
        v.commons = f.commons;
        v.ownerId = f.ownerId;
        break;
      }
      case "smelter": {
        const sm = state.smelters.find((x) => x.siteId === site.id)!;
        v.fee = sm.fee;
        v.ownerId = sm.ownerId;
        break;
      }
      case "houseLot": {
        const lot = state.lots.find((x) => x.siteId === site.id)!;
        v.ownerId = lot.ownerId;
        if (lot.ownerId) v.building = { ownerId: lot.ownerId, progress: lot.progress, required: lot.required, complete: lot.complete };
        break;
      }
    }
    return v;
  });
}

export function jobViews(state: WorldState): JobView[] {
  return state.jobs.map((j) => ({
    id: j.id,
    employerId: j.employerId,
    siteId: j.siteId,
    task: j.task,
    wage: j.wage,
    openings: j.openings,
    hiredLastShift: j.hiredLastShift,
    arrears: j.arrears,
  }));
}

export function minerView(state: WorldState, m: MinerState): MinerView {
  const loans = state.bank.loans.filter((l) => l.borrowerId === m.id);
  const job = m.jobId ? state.jobs.find((j) => j.id === m.jobId) : undefined;
  return {
    id: m.id,
    name: m.name,
    location: m.location,
    home: { kind: m.homeKind, siteId: m.homeSiteId },
    skills: { ...m.skills },
    riskAppetite: m.riskAppetite,
    ...(m.traits ? { traits: m.traits } : {}),
    needs: { ...m.needs },
    wellbeing: m.wellbeing,
    cash: m.cash,
    inventory: { ...m.inventory },
    debt: minerDebt(state, m.id),
    loans: loans.map((l) => ({
      id: l.id,
      balance: l.balance,
      ratePerDay: l.ratePerDay,
      installment: installment(l),
      missed: l.missed,
      dueDay: l.issuedDay + l.termDays,
      collateralSiteId: l.collateralSiteId,
    })),
    creditBarredUntilDay: m.creditBarredUntilDay,
    injuredUntilShift: m.injuredUntilShift,
    employment: job ? { jobId: job.id, employerId: job.employerId, wage: job.wage } : undefined,
    ownedSites: [
      ...state.farms.filter((f) => f.ownerId === m.id).map((f) => f.siteId),
      ...state.smelters.filter((s) => s.ownerId === m.id).map((s) => s.siteId),
      ...state.lots.filter((l) => l.ownerId === m.id).map((l) => l.siteId),
    ],
    veinYield: { ...m.veinYield },
    lastIncome: m.lastIncome,
    lastAction: m.lastAction,
  };
}

export function tradingPostView(state: WorldState): Observation["tradingPost"] {
  const buys: Partial<Record<Good, number>> = {};
  const sells: Partial<Record<Good, number>> = {};
  for (const g of GOODS) {
    buys[g] = exportPrice(g, state.worldPrices[g], state.dials);
    if (g !== "copperOre") sells[g] = importPrice(state.worldPrices[g], state.dials);
  }
  return { buys, sells };
}

/** Builds every miner's observation for the shift about to be resolved. */
export function observeAll(ctx: SimContext, state: WorldState): Record<string, Observation> {
  const prices = structuredClone(state.prices);
  const tradingPost = tradingPostView(state);
  const jobs = jobViews(state);
  const dials = { ...state.dials };
  const rate = Math.round(bankRate(state) * 10000) / 10000;
  const baseSites = siteViews(ctx, state);
  // Many miners stand at the same site, so build each location's view once.
  const byLocation = new Map<string, SiteView[]>();
  const sitesFrom = (loc: string) => {
    let v = byLocation.get(loc);
    if (!v) {
      v = baseSites.map((s) => ({ ...s, travel: round3(ctx.travel[loc]?.[s.id] ?? 0) }));
      byLocation.set(loc, v);
    }
    return v;
  };
  const out: Record<string, Observation> = {};
  for (const m of state.miners) {
    out[m.id] = {
      seed: state.seed,
      shift: state.shift,
      day: dayOf(state.shift),
      isDayEnd: state.shift % 2 === 1,
      self: minerView(state, m),
      prices,
      tradingPost,
      sites: sitesFrom(m.location),
      jobs,
      bank: { ratePerDay: rate, myLimit: loanLimit(state, m), lending: state.bank.lending },
      dials,
      witnessed: witnessedBy(state.recentEvents, m.id),
    };
  }
  return out;
}

export function witnessedBy(events: WorldEvent[], minerId: string): WorldEvent[] {
  return events.filter((e) => (e.witnesses ? e.witnesses.includes(minerId) : PUBLIC_KINDS.has(e.kind)));
}

export function minerPublic(state: WorldState, m: MinerState): MinerPublic {
  const job = m.jobId ? state.jobs.find((j) => j.id === m.jobId) : undefined;
  return {
    id: m.id,
    name: m.name,
    location: m.location,
    destination: m.destination,
    activity: m.lastAction,
    cash: m.cash,
    debt: minerDebt(state, m.id),
    wellbeing: m.wellbeing,
    needs: { ...m.needs },
    home: m.homeKind,
    injured: m.collapsed || state.shift < m.injuredUntilShift,
    employerId: job?.employerId,
  };
}

export function snapshot(ctx: SimContext, state: WorldState): WorldSnapshot {
  return {
    seed: state.seed,
    shift: state.shift,
    day: dayOf(state.shift),
    miners: state.miners.map((m) => minerPublic(state, m)),
    sites: siteViews(ctx, state),
    jobs: jobViews(state),
    prices: structuredClone(state.prices),
    dials: { ...state.dials },
    metrics: state.lastMetrics,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
