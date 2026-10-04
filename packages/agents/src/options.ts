// What a miner could do this shift, and roughly what each option is worth in coins.
// Both the fuzzy brain and the LLM brain choose from this menu, so they play the same game.

import { keyedRng, type Action, type Good, type Observation, type SiteView } from "@motherlode/shared";
import { costOfLivingPerDay, crowdFactor, workFactor } from "@motherlode/sim";

export type ActionClass = "rest" | "farm" | "chop" | "dig" | "digGold" | "smelt" | "work" | "build";
export const CLASSES: ActionClass[] = ["rest", "farm", "chop", "dig", "digGold", "smelt", "work", "build"];

export interface Option {
  /** Short stable id, e.g. "dig:copper-2" or "work:J7". */
  key: string;
  cls: ActionClass;
  action: Action;
  /** Expected coins this shift (after fees and fuel; minus an allowance for cave-in risk). */
  income: number;
  /** Chance of a cave-in, for digging. */
  risk?: number;
  label: string;
}

/** Prices and rules every estimate needs. */
export interface Market {
  value: (g: Good) => number;
  last: (g: Good) => number;
  tpBuy: (g: Good) => number;
  tpSell: (g: Good) => number;
  costPerDay: number;
  smelter?: SiteView;
  fee: number;
  smeltValuePerOre: number;
}

export function market(obs: Observation): Market {
  const last = (g: Good) => obs.prices[g].last;
  const tpBuy = (g: Good) => obs.tradingPost.buys[g] ?? 0;
  const tpSell = (g: Good) => obs.tradingPost.sells[g] ?? Infinity;
  const value = (g: Good) => Math.max(last(g), tpBuy(g));
  const smelter = obs.sites.find((s) => s.kind === "smelter");
  const fee = smelter && smelter.ownerId !== obs.self.id ? smelter.fee ?? 0 : 0;
  return {
    value,
    last,
    tpBuy,
    tpSell,
    costPerDay: costOfLivingPerDay(last("food"), obs.dials),
    smelter,
    fee,
    smeltValuePerOre: Math.max(0, value("copper") / 2 - obs.dials.smeltFuel * last("timber") - fee),
  };
}

export function listOptions(obs: Observation, mk: Market = market(obs)): Option[] {
  const me = obs.self;
  const d = obs.dials;
  const opts: Option[] = [{ key: "rest", cls: "rest", action: { type: "rest" }, income: 0, label: "rest" }];
  const stay = (s: SiteView) => (me.location === s.id ? 1.1 : 1);
  const wf = (s: SiteView) => workFactor(me.needs.energy, me.needs.health, s.travel) * stay(s);
  const crowd = (s: SiteView) => crowdFactor(s.workersLastShift + (me.location === s.id ? 0 : 1), s.capacity);
  const rumoured = new Set([
    ...obs.witnessed.filter((e) => e.kind === "rumour" && e.siteId).map((e) => e.siteId!),
    ...obs.sites.filter((s) => s.richStrike).map((s) => s.id),
  ]);

  for (const s of obs.sites) {
    if (s.kind === "farm" && (s.commons || s.ownerId === me.id)) {
      const rate = d.farmYield * me.skills.farming * (s.fertility ?? 1);
      opts.push({ key: `farm:${s.id}`, cls: "farm", action: { type: "farm", siteId: s.id }, income: rate * crowd(s) * wf(s) * mk.value("food"), label: `farm ${s.name}` });
    }
    if (s.kind === "forest") {
      const rate = d.chopYield * me.skills.chopping * Math.sqrt(s.stockFraction ?? 0);
      opts.push({ key: `chop:${s.id}`, cls: "chop", action: { type: "chop", siteId: s.id }, income: rate * crowd(s) * wf(s) * mk.value("timber"), label: `chop in ${s.name}` });
    }
    if (s.kind === "vein" && !s.exhausted) {
      const gold = s.ore === "gold";
      const prior = (gold ? d.goldYield : d.digYield) * me.skills.mining * 0.8;
      let rate = me.veinYield[s.id] ?? prior;
      if (rumoured.has(s.id)) rate = Math.max(rate, prior) * 3;
      const unit = gold ? mk.value("gold") : Math.max(mk.value("copperOre"), mk.smeltValuePerOre * 0.8);
      const risk = Math.min(0.5, d.caveInRisk * (1 + (s.unsupportedDepth ?? 0)) * 1.2);
      const riskCost = risk * d.injuryShifts * Math.max(40, mk.costPerDay);
      opts.push({
        key: `dig:${s.id}`,
        cls: gold ? "digGold" : "dig",
        action: { type: "dig", siteId: s.id },
        income: rate * crowd(s) * wf(s) * unit - riskCost,
        risk,
        label: `dig ${gold ? "gold" : "copper"} at ${s.name}`,
      });
    }
  }

  if (mk.smelter && me.inventory.copperOre >= 2) {
    const ore = Math.min(Math.floor(d.smeltCapacity * me.skills.smelting * wf(mk.smelter)), me.inventory.copperOre);
    const fuel = Math.ceil(ore * d.smeltFuel);
    if (ore >= 2 && me.inventory.timber >= fuel && me.cash >= ore * mk.fee) {
      const gain = (ore / 2) * mk.value("copper") - ore * mk.value("copperOre") - fuel * mk.last("timber") - ore * mk.fee;
      opts.push({ key: `smelt:${mk.smelter.id}`, cls: "smelt", action: { type: "smelt", siteId: mk.smelter.id }, income: gain, label: `smelt ${ore} ore` });
    }
  }

  for (const j of obs.jobs) {
    if (j.employerId === me.id || j.arrears >= 2) continue;
    const mine = me.employment?.jobId === j.id;
    if (!mine && j.hiredLastShift >= j.openings) continue;
    // You only hear about a few open jobs each shift, so the whole town doesn't apply for the same one.
    if (!mine && !keyedRng(obs.seed, obs.shift, "heard-of-job", me.id, j.id).chance(Math.min(1, 0.05 * (j.openings - j.hiredLastShift)))) continue;
    opts.push({ key: `work:${j.id}`, cls: "work", action: { type: "work", jobId: j.id }, income: j.wage * (mine ? 1 : 0.85), label: `${j.task} for ${j.employerId} at ${j.wage}/shift` });
  }

  const build = buildOption(obs, mk);
  if (build) opts.push(build);
  return opts;
}

/** Keep building your house; or buy a foreclosed one; or start one if you have the materials. */
function buildOption(obs: Observation, mk: Market): Option | undefined {
  const me = obs.self;
  const d = obs.dials;
  const myLot = obs.sites.find((s) => s.kind === "houseLot" && s.ownerId === me.id);
  if (myLot?.building && !myLot.building.complete) {
    return { key: `build:${myLot.id}`, cls: "build", action: { type: "build", siteId: myLot.id }, income: 0, label: "keep building my house" };
  }
  if (me.home.kind === "house" || myLot) return undefined;
  const forSale = obs.sites.find((s) => s.kind === "houseLot" && s.ownerId === "town" && s.building?.complete);
  if (forSale && me.cash >= 2 * d.houseSalvage + mk.costPerDay * 5) {
    return { key: `build:${forSale.id}`, cls: "build", action: { type: "build", siteId: forSale.id }, income: 0, label: "buy a foreclosed house" };
  }
  const empty = obs.sites.filter((s) => s.kind === "houseLot" && !s.ownerId).sort((a, b) => a.travel - b.travel)[0];
  if (empty && me.inventory.timber >= d.houseTimber && me.inventory.copper >= d.houseCopper && me.cash >= d.lotPrice + mk.costPerDay * 3) {
    return { key: `build:${empty.id}`, cls: "build", action: { type: "build", siteId: empty.id }, income: 0, label: "start a house" };
  }
  return undefined;
}

/** What it would cost to get a house from scratch at today's prices. */
export function houseCost(obs: Observation, mk: Market): number {
  const d = obs.dials;
  return d.lotPrice + d.houseTimber * mk.last("timber") + d.houseCopper * mk.last("copper");
}

/** Cash plus stores, minus debt. */
export function worth(obs: Observation, mk: Market): number {
  const me = obs.self;
  return me.cash - me.debt + me.inventory.food * mk.last("food") + me.inventory.timber * mk.last("timber");
}
