// The market-and-money side of a decision: what to buy and sell, and how to behave as an employer.
// Shared by the fuzzy and LLM brains so both trade sensibly; personality tilts the numbers.

import type { Good, Intent, JobOffer, Observation, Order } from "@motherlode/shared";
import { houseCost, type ActionClass, type Market } from "./options";
import type { Personality } from "./population";

export interface TradePlan {
  orders: Order[];
  postJob?: JobOffer;
  cancelJobs?: string[];
  smelterFee?: number;
}

export function planTrades(obs: Observation, mk: Market, chosen: ActionClass, p: Personality): TradePlan {
  const me = obs.self;
  const d = obs.dials;
  const orders: Order[] = [];
  const buy = (good: Good, qty: number, limit: number) => {
    const l = Math.floor(Math.min(limit, 1_000_000));
    if (qty > 0 && l >= 1) orders.push({ good, side: "buy", qty, limit: l });
  };
  const sell = (good: Good, qty: number, limit: number) => {
    if (qty > 0) orders.push({ good, side: "sell", qty, limit: Math.max(1, Math.floor(limit)) });
  };
  // Ask a bit under the going rate; if nothing traded last shift that rate is stale, so fall
  // back to what the Trading Post pays (otherwise markets deadlock on an old price).
  const surplusAsk = (g: Good) => (obs.prices[g].volume > 0 ? Math.max(mk.tpBuy(g), mk.last(g) * 0.85) : mk.tpBuy(g));

  // Food: thrifty miners keep bigger stores.
  const keep = 3 + Math.round(3 * p.thrift);
  const food = me.inventory.food;
  if (food < keep - 1) {
    const want = keep - food + (me.needs.nourishment < 0.4 ? 1 : 0);
    const limit = mk.tpSell("food");
    const afford = Math.floor(me.cash / limit);
    if (afford >= 1) buy("food", Math.min(want, afford), limit);
    else if (me.cash >= 1) buy("food", 1, me.cash);
  } else if (food > keep + 1) sell("food", food - keep, surplusAsk("food"));

  // Timber: supports when digging, fuel when smelting, materials when saving for a house.
  const wantsHouse = me.home.kind !== "house" && !me.ownedSites.some((id) => id.startsWith("lot")) &&
    me.cash + me.inventory.copper * mk.last("copper") >= houseCost(obs, mk) + mk.costPerDay * 5;
  let timberNeed = 0;
  if (chosen === "dig" || chosen === "digGold") timberNeed += 2 * d.supportTimber;
  if (me.inventory.copperOre >= 2 || chosen === "smelt") timberNeed += Math.ceil(Math.max(me.inventory.copperOre, d.smeltCapacity) * d.smeltFuel);
  if (wantsHouse) timberNeed += d.houseTimber;
  if (me.inventory.timber < timberNeed) buy("timber", timberNeed - me.inventory.timber, Math.min(mk.tpSell("timber"), mk.last("timber") * 1.3 + 2));
  else if (me.inventory.timber > timberNeed + 3) sell("timber", me.inventory.timber - timberNeed - 2, surplusAsk("timber"));

  // Ore: skilled smelters (and the smelter's owner) buy it up; everyone else sells it on.
  const ownsSmelter = !!mk.smelter && mk.smelter.ownerId === me.id;
  const goodSmelter = me.skills.smelting >= 1 || ownsSmelter;
  const canAfford = me.cash >= mk.fee * Math.min(me.inventory.copperOre, d.smeltCapacity) + 30;
  if (me.inventory.copperOre > 0 && chosen !== "smelt" && (!goodSmelter || !canAfford)) {
    sell("copperOre", me.inventory.copperOre, Math.max(mk.tpBuy("copperOre"), mk.smeltValuePerOre * 0.5));
  } else if (goodSmelter && me.cash > 150 && me.inventory.copperOre < 12 && mk.smeltValuePerOre * 0.8 > mk.tpBuy("copperOre")) {
    buy("copperOre", 12 - me.inventory.copperOre, mk.smeltValuePerOre * 0.8);
  }

  // Metals: keep copper for a house, sell the rest; gold is for selling.
  const keepCopper = wantsHouse ? d.houseCopper : 0;
  if (me.inventory.copper > keepCopper) sell("copper", me.inventory.copper - keepCopper, mk.tpBuy("copper") * 0.5);
  else if (me.inventory.copper < keepCopper) buy("copper", keepCopper - me.inventory.copper, mk.tpSell("copper"));
  if (me.inventory.gold > 0) sell("gold", me.inventory.gold, mk.tpBuy("gold") * 0.5);

  return { orders, ...employer(obs, mk, chosen) };
}

/** Owners of private farm plots and the smelter hire help, and the smelter owner prices the fee. */
function employer(obs: Observation, mk: Market, chosen: ActionClass): Omit<TradePlan, "orders"> {
  const me = obs.self;
  const d = obs.dials;
  const myJobs = obs.jobs.filter((j) => j.employerId === me.id);
  const out: Omit<TradePlan, "orders"> = {};
  const cancel: string[] = [];
  // A well-off owner expands: more hands, and a bigger share of the harvest as wages. That's how
  // a landlord's profits flow back to the town instead of piling up.
  const days = (me.cash - me.debt) / mk.costPerDay;
  const prosperous = days > 40;
  for (const s of obs.sites) {
    if (s.kind !== "farm" || s.ownerId !== me.id || s.commons) continue;
    const job = myJobs.find((j) => j.siteId === s.id);
    const share = prosperous ? 0.8 : 0.6;
    const openings = prosperous ? Math.max(2, s.capacity - (chosen === "farm" ? 1 : 0)) : 2;
    const wage = Math.floor(d.farmYield * (s.fertility ?? 1) * 0.8 * mk.value("food") * share);
    if (job && (job.openings !== openings || job.wage < wage * 0.8)) {
      cancel.push(job.id); // re-post on better terms next shift
    } else if (!job && !out.postJob && me.cash >= wage * 6 && wage >= 5 && (chosen !== "farm" || prosperous)) {
      out.postJob = { siteId: s.id, task: "farm", wage, openings };
    }
    if (job && me.cash < job.wage * 2) cancel.push(job.id);
  }
  const sm = mk.smelter;
  if (sm && sm.ownerId === me.id) {
    const job = myJobs.find((j) => j.siteId === sm.id);
    const perShift = Math.floor((d.smeltCapacity / 2) * mk.value("copper") - d.smeltCapacity * Math.max(mk.last("copperOre"), 1));
    if (!job && !out.postJob && me.inventory.copperOre >= 12 && perShift > 20) out.postJob = { siteId: sm.id, task: "smelt", wage: Math.floor(perShift * 0.5), openings: 1 };
    if (job && me.inventory.copperOre < 4) cancel.push(job.id);
    const used = sm.workersLastShift;
    const fee0 = sm.fee ?? 0;
    const next = Math.min(d.maxSmelterFee, used >= sm.capacity ? fee0 + 1 : used === 0 ? Math.max(2, fee0 - 1) : fee0);
    if (next !== fee0) out.smelterFee = next;
  }
  if (cancel.length) out.cancelJobs = cancel;
  return out;
}

/** Turns money decisions (0..1 strengths) into coins, with safety limits whatever the brain says. */
export function moneyMoves(obs: Observation, mk: Market, worthNow: number, spend: number, borrow: number, repay: number, borrowFor = 150): Pick<Intent, "spendOnComforts" | "borrow" | "repay"> {
  const me = obs.self;
  const out: Pick<Intent, "spendOnComforts" | "borrow" | "repay"> = {};
  // Comforts only from savings above ~20 days of living costs.
  const surplus = Math.min(me.cash, worthNow - 20 * mk.costPerDay);
  // Paced: even a keen spender only uses a slice of the surplus each shift.
  if (spend > 0.1 && surplus > 20) out.spendOnComforts = Math.floor(Math.min(surplus * spend * 0.2, 320));
  if (borrow > 0.5 && me.debt === 0 && obs.bank.lending && obs.bank.myLimit > 0) out.borrow = Math.min(obs.bank.myLimit, Math.max(1, borrowFor));
  if (repay > 0.5 && me.debt > 0) {
    const spare = me.cash - 10 * mk.costPerDay;
    if (spare > 0) out.repay = Math.floor(Math.min(me.debt, spare));
  }
  return out;
}
