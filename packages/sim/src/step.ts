// One shift of the world. Pure: (state, inputs) -> (new state, record). No I/O, no clocks, no Math.random.
//
// The phase order is part of causality, so it is fixed:
//   1. Overseer actions      2. validate intents   3. travel        4. production (+ cave-ins)
//   5. bank: new loans       6. market auctions    7. wages         8. job postings
//   9. hunger, eating, rent  10. bank day-end      11. needs, relief 12. nature
//   13. metrics, events, invariant check

import {
  GOODS,
  keyedRng,
  type Good,
  type Intent,
  type MinerActivity,
  type Order,
  type ShiftInputs,
  type ShiftRecord,
  type TradeFill,
  type WorkTask,
} from "@motherlode/shared";
import { EventLog, checkInvariants, create, destroy, newTally, transfer, type Tally } from "./books";
import { bankDayEnd, minerDebt, repayExtra, requestLoan, updateLending, TOWN_ID } from "./bank";
import { clearAuction, type AuctionOrder } from "./market";
import { computeMetrics } from "./metrics";
import { applyOverseer, injure } from "./overseer";
import {
  caveInChance,
  chopRate,
  crowdFactor,
  digRate,
  farmRate,
  regrowForest,
  unsupportedDepth,
  workFactor,
} from "./production";
import { TRADING_POST_ID, driftWorldPrice, exportPrice, importPrice, tradingPostOrders } from "./tradingPost";
import { REST_QUALITY, SHELTER, clamp01, costOfLivingPerDay, netWorth, security, wellbeing } from "./wellbeing";
import {
  cmp,
  dayOf,
  worldBasePrices,
  type Holder,
  type Job,
  type MinerState,
  type SimContext,
  type WorldState,
} from "./world";

export interface StepOptions {
  /** Throw if the books don't balance (default true). */
  checkInvariants?: boolean;
}

interface Plan {
  miner: MinerState;
  task: "rest" | WorkTask;
  siteId?: string;
  jobId?: string;
  /** Who gets the output: the miner, or their employer. */
  beneficiary: MinerState;
  valid: boolean;
  reason?: string;
  output: Partial<Record<Good, number>>;
  worked: boolean;
}

export function step(ctx: SimContext, prev: WorldState, inputs: ShiftInputs, opts: StepOptions = {}): { state: WorldState; record: ShiftRecord } {
  // Last shift's events and metrics are replaced, never mutated, so they needn't be deep-copied.
  const { recentEvents, lastMetrics, ...rest } = prev;
  const state = structuredClone(rest) as WorldState;
  state.recentEvents = recentEvents;
  state.lastMetrics = lastMetrics;
  const s = state.shift;
  const isDayEnd = s % 2 === 1;
  const log = new EventLog(s);
  const tally = newTally();
  const byId = new Map(state.miners.map((m) => [m.id, m]));
  const trades: TradeFill[] = [];

  for (const m of state.miners) {
    m.lastIncome = 0;
    if (inputs.social && inputs.social[m.id] !== undefined) m.social = Math.max(-0.5, Math.min(0.5, inputs.social[m.id]));
  }

  // World prices wander a little each shift.
  const base = worldBasePrices(state.dials);
  for (const g of GOODS) {
    state.worldPrices[g] = driftWorldPrice(state.worldPrices[g], base[g], state.dials.worldPriceVolatility, keyedRng(state.seed, s, "world-price", g));
  }

  // 1. Overseer
  applyOverseer(ctx, state, inputs.overseer, log, tally);
  state.modifiers = state.modifiers.filter((mod) => mod.untilShift > s);

  // 2. Validate intents
  const intents = (id: string): Intent => inputs.intents[id] ?? { action: { type: "rest" }, reason: "no intent" };
  const plans = planShift(ctx, state, intents, log);

  // 3. Travel
  const activities: MinerActivity[] = [];
  const roster: Record<string, string[]> = {};
  for (const p of plans) if (p.task !== "rest" && p.siteId) (roster[p.siteId] ??= []).push(p.miner.id);
  const workers: Record<string, number> = Object.fromEntries(Object.entries(roster).map(([k, v]) => [k, v.length]));

  // 4. Production
  for (const p of plans) produce(ctx, state, p, roster, log, tally);
  for (const p of plans) {
    const m = p.miner;
    const from = m.location;
    const to = p.task === "rest" || !p.siteId ? restSite(ctx, m) : p.siteId;
    m.destination = to;
    m.location = to;
    m.lastAction = p.task;
    activities.push({
      minerId: m.id,
      action: p.jobId ? "work" : p.task,
      siteId: p.siteId,
      jobId: p.jobId,
      from,
      to,
      output: Object.keys(p.output).length ? p.output : undefined,
      valid: p.valid,
      reason: p.reason ?? intents(m.id).reason,
      trace: intents(m.id).trace,
    });
  }

  // 5. Bank: extra repayments, then new loans (borrowed cash can be spent at this shift's market)
  for (const m of state.miners) {
    const it = intents(m.id);
    if (it.repay && it.repay > 0) repayExtra(state, m, it.repay, log);
  }
  for (const m of state.miners) {
    const it = intents(m.id);
    if (it.borrow && it.borrow > 0) requestLoan(state, m, it.borrow, log, tally);
  }

  // 6. Market
  runMarkets(state, intents, log, tally, trades);

  // 7. Wages
  payWages(state, plans, log);

  // 8. Job postings, cancellations, smelter fees (take effect next shift)
  manageJobs(ctx, state, intents, log);

  // 9. Hunger, eating, spoilage, rent
  for (const m of state.miners) consume(state, m, intents(m.id), log, tally);
  spoil(state, state.bank, keyedRng(state.seed, s, "spoil", "bank"), tally);
  spoil(state, state.treasury, keyedRng(state.seed, s, "spoil", "treasury"), tally);

  // 10. Bank day-end
  if (isDayEnd) bankDayEnd(state, byId, log, tally);
  updateLending(state, log);

  // 11. Needs, relief, dividend
  const workedIds = new Set(plans.filter((p) => p.worked).map((p) => p.miner.id));
  for (const m of state.miners) updateNeeds(state, m, workedIds.has(m.id), log);
  if (isDayEnd) {
    poorRelief(state, log, tally);
    wealthTax(state);
    townDividend(state);
  }
  const prices = lastPrices(state);
  const col = costOfLivingPerDay(prices.food, state.dials);
  for (const m of state.miners) {
    m.needs.security = security(netWorth(m.cash, m.inventory, minerDebt(state, m.id), prices), col);
    m.wellbeing = round4(wellbeing(m.needs, m.social));
    m.incomeHistory.push(m.lastIncome);
    if (m.incomeHistory.length > 6) m.incomeHistory.shift();
  }

  // 12. Nature
  for (const f of state.forests) {
    f.stock = regrowForest(f, state.dials.forestRegrowth);
    if (f.depleted && f.stock > 0.3 * f.capacity) f.depleted = false;
  }
  for (const f of state.farms) f.fertility = Math.min(1, f.fertility + state.dials.fertilityRecovery);

  // 13. Wrap up
  state.lastWorkers = workers;
  state.recentEvents = log.events;
  const metrics = computeMetrics(state, s, plans.map((p) => (p.jobId ? "work" : p.task)), tally);
  state.lastMetrics = metrics;
  state.shift = s + 1;

  if (opts.checkInvariants !== false) {
    const problems = checkInvariants(state);
    if (problems.length) throw new Error(`Invariant broken at shift ${s}:\n- ${problems.join("\n- ")}`);
  }
  return { state, record: { shift: s, day: dayOf(s), events: log.events, metrics, activities, trades } };
}

// ---------------------------------------------------------------- planning

function planShift(ctx: SimContext, state: WorldState, intents: (id: string) => Intent, log: EventLog): Plan[] {
  const s = state.shift;
  const plans = new Map<string, Plan>();
  const hires: Record<string, number> = {};
  // People already in a job keep their place; new applicants are served in a seeded random
  // order so low ids don't always win.
  const byId = new Map(state.miners.map((m) => [m.id, m]));
  const shuffled = keyedRng(state.seed, s, "hiring").shuffle(state.miners.map((m) => m.id));
  const incumbent = (id: string) => {
    const a = intents(id)?.action;
    return a?.type === "work" && a.jobId === byId.get(id)!.jobId;
  };
  const order = [...shuffled.filter(incumbent), ...shuffled.filter((id) => !incumbent(id))];

  for (const id of order) {
    const m = byId.get(id)!;
    const rest = (valid: boolean, reason?: string): Plan => ({ miner: m, task: "rest", beneficiary: m, valid, reason, output: {}, worked: false });
    if (m.collapsed || s < m.injuredUntilShift) {
      plans.set(id, rest(true, m.collapsed ? "collapsed" : "injured"));
      continue;
    }
    const intent = intents(id);
    const a = intent?.action;
    const bad = (why: string) => {
      log.emit({ kind: "invalid-intent", actors: [id], data: { action: a?.type ?? null, why }, text: `${m.name}: ${why}` });
      plans.set(id, rest(false, why));
    };
    if (!a || typeof a !== "object") {
      bad("missing action");
      continue;
    }
    if (a.type === "rest") {
      plans.set(id, rest(true));
      continue;
    }
    if (a.type === "work") {
      const job = state.jobs.find((j) => j.id === a.jobId);
      if (!job) {
        bad(`no job "${a.jobId}"`);
        continue;
      }
      const employer = byId.get(job.employerId);
      if (!employer || employer.id === id) {
        bad("can't work for yourself");
        continue;
      }
      if ((hires[job.id] ?? 0) >= job.openings) {
        bad("job already filled");
        continue;
      }
      const why = siteProblem(ctx, state, job.task, job.siteId, employer);
      if (why) {
        bad(why);
        continue;
      }
      hires[job.id] = (hires[job.id] ?? 0) + 1;
      plans.set(id, { miner: m, task: job.task, siteId: job.siteId, jobId: job.id, beneficiary: employer, valid: true, output: {}, worked: true });
      continue;
    }
    const task = a.type as WorkTask;
    const siteId = (a as { siteId?: string }).siteId;
    if (!["dig", "chop", "farm", "smelt", "build"].includes(task) || typeof siteId !== "string") {
      bad(`unknown action "${String(a.type)}"`);
      continue;
    }
    const why = siteProblem(ctx, state, task, siteId, m);
    if (why) {
      bad(why);
      continue;
    }
    plans.set(id, { miner: m, task, siteId, beneficiary: m, valid: true, output: {}, worked: true });
  }

  for (const j of state.jobs) j.hiredLastShift = hires[j.id] ?? 0;

  // Employment changes (for the narrator and Lane 2's union).
  for (const m of state.miners) {
    const p = plans.get(m.id)!;
    if (p.jobId !== m.jobId) {
      if (m.jobId && state.jobs.some((j) => j.id === m.jobId)) {
        const old = state.jobs.find((j) => j.id === m.jobId)!;
        log.emit({ kind: "quit", actors: [m.id, old.employerId], data: { jobId: old.id } });
      }
      if (p.jobId) log.emit({ kind: "hired", actors: [m.id, p.beneficiary.id], data: { jobId: p.jobId, wage: state.jobs.find((j) => j.id === p.jobId)!.wage } });
      m.jobId = p.jobId;
    }
  }
  return state.miners.map((m) => plans.get(m.id)!);
}

/** Why `owner` can't have `task` done at `siteId` (undefined if fine). */
function siteProblem(ctx: SimContext, state: WorldState, task: WorkTask, siteId: string, owner: MinerState): string | undefined {
  const site = ctx.sites[siteId];
  if (!site) return `no site "${siteId}"`;
  const needKind: Record<WorkTask, string> = { dig: "vein", chop: "forest", farm: "farm", smelt: "smelter", build: "houseLot" };
  if (site.kind !== needKind[task]) return `can't ${task} at a ${site.kind}`;
  if (task === "farm") {
    const f = state.farms.find((x) => x.siteId === siteId)!;
    if (!f.commons && f.ownerId !== owner.id) return "that farm belongs to someone else";
  }
  if (task === "build") {
    const lot = state.lots.find((l) => l.siteId === siteId)!;
    if (lot.ownerId === owner.id) return lot.complete ? "house already finished" : undefined;
    if (lot.ownerId === TOWN_ID && lot.complete) return state.lots.some((l) => l.ownerId === owner.id) ? "already has a house or lot" : undefined;
    if (lot.ownerId) return "that lot belongs to someone else";
    if (state.lots.some((l) => l.ownerId === owner.id)) return "already has a house or lot";
  }
  return undefined;
}

function restSite(ctx: SimContext, m: MinerState): string {
  if (m.homeSiteId) return m.homeSiteId;
  return ctx.map.sites.find((s) => s.kind === "bunkhouse")!.id;
}

// ---------------------------------------------------------------- production

function produce(ctx: SimContext, state: WorldState, p: Plan, roster: Record<string, string[]>, log: EventLog, tally: Tally): void {
  if (p.task === "rest" || !p.siteId) return;
  const workers: Record<string, number> = { [p.siteId]: roster[p.siteId]?.length ?? 1 };
  const s = state.shift;
  const m = p.miner;
  const ben = p.beneficiary;
  const d = state.dials;
  const rng = keyedRng(state.seed, s, "work", m.id);
  const wf = workFactor(m.needs.energy, m.needs.health, ctx.travel[m.location]?.[p.siteId] ?? 0);
  const crowd = crowdFactor(workers[p.siteId] ?? 1, ctx.capacity[p.siteId]);
  const region = ctx.sites[p.siteId].region;
  const give = (good: Good, qty: number) => {
    if (qty <= 0) return;
    create(state, ben, good, qty);
    tally.output[good] += qty;
    p.output[good] = (p.output[good] ?? 0) + qty;
  };
  const use = (good: Good, qty: number) => {
    if (qty <= 0) return;
    destroy(state, ben, good, qty);
    tally.consumed[good] += qty;
  };

  switch (p.task) {
    case "dig": {
      const v = state.veins.find((x) => x.siteId === p.siteId)!;
      if (v.exhausted) return;
      const rate = digRate(v, m.skills.mining, d) * crowd * wf;
      let qty = Math.min(rng.roundStochastic(rate), v.tonnage - v.extracted);
      // Shore up the shaft first if there's timber to do it with.
      if (v.depth > v.supportedDepth && ben.inventory.timber >= d.supportTimber) {
        use("timber", d.supportTimber);
        v.supportedDepth++;
      }
      const quakes = state.modifiers.filter((x) => x.kind === "earthquake" && (!x.region || x.region === region));
      const quake = quakes.reduce((acc, x) => acc * x.magnitude, 1);
      if (rng.chance(caveInChance(v, d, quake))) {
        qty = Math.floor(qty / 2);
        v.supportedDepth = Math.max(0, v.supportedDepth - 1);
        injure(m, s, d.injuryShifts, 0.35);
        const witnesses = roster[v.siteId] ?? [m.id];
        log.emit({
          kind: "cave-in",
          actors: [m.id],
          siteId: v.siteId,
          data: { depth: v.depth, unsupported: unsupportedDepth(v), quake },
          causes: [...quakes.map((x) => x.sourceEventId), ...(unsupportedDepth(v) > 0 ? ["unsupported-shaft"] : []), "dial:caveInRisk"],
          witnesses,
          text: `A shaft collapses on ${m.name} at ${ctx.sites[v.siteId].name}.`,
        });
      }
      v.extracted += qty;
      if (v.pocket) {
        v.pocket.remaining -= qty;
        if (v.pocket.remaining <= 0) delete v.pocket;
      }
      v.depth = Math.floor(v.extracted / (d.orePerLevel * v.faceScale));
      m.veinYield[v.siteId] = Math.round((rate / Math.max(0.01, crowd * wf)) * 100) / 100;
      give(v.ore === "gold" ? "gold" : "copperOre", qty);
      if (v.extracted >= v.tonnage && !v.exhausted) {
        v.exhausted = true;
        log.emit({ kind: "vein-exhausted", siteId: v.siteId, data: { extracted: v.extracted }, text: `${ctx.sites[v.siteId].name} is worked out.` });
      }
      return;
    }
    case "chop": {
      const f = state.forests.find((x) => x.siteId === p.siteId)!;
      const qty = Math.min(Math.floor(f.stock), rng.roundStochastic(chopRate(f, m.skills.chopping, d) * crowd * wf));
      f.stock -= qty;
      give("timber", qty);
      if (!f.depleted && f.stock < 0.1 * f.capacity) {
        f.depleted = true;
        log.emit({ kind: "forest-depleted", siteId: f.siteId, data: { stock: Math.round(f.stock) }, text: `${ctx.sites[f.siteId].name} is nearly stripped.` });
      }
      return;
    }
    case "farm": {
      const f = state.farms.find((x) => x.siteId === p.siteId)!;
      const droughts = state.modifiers.filter((x) => x.kind === "drought" && (!x.region || x.region === region));
      const drought = droughts.reduce((acc, x) => acc * x.magnitude, 1);
      give("food", rng.roundStochastic(farmRate(f, m.skills.farming, d, drought) * crowd * wf));
      f.fertility = Math.max(0.3, f.fertility - d.fertilityDrain);
      return;
    }
    case "smelt": {
      const sm = state.smelters.find((x) => x.siteId === p.siteId)!;
      const capacity = rng.roundStochastic(d.smeltCapacity * m.skills.smelting * wf);
      let ore = Math.min(capacity, ben.inventory.copperOre);
      ore -= ore % 2;
      const fuel = (q: number) => Math.ceil(q * d.smeltFuel);
      while (ore > 0 && fuel(ore) > ben.inventory.timber) ore -= 2;
      const owner = sm.ownerId ? state.miners.find((x) => x.id === sm.ownerId) : undefined;
      const payee: Holder = owner ?? state.treasury;
      const feePerOre = owner && owner.id === ben.id ? 0 : Math.min(sm.fee, d.maxSmelterFee);
      if (feePerOre > 0) while (ore > 0 && ore * feePerOre > ben.cash) ore -= 2;
      if (ore <= 0) return;
      if (feePerOre > 0) {
        transfer(ben, payee, "cash", ore * feePerOre);
        if (owner) owner.lastIncome += ore * feePerOre;
      }
      use("copperOre", ore);
      use("timber", fuel(ore));
      give("copper", ore / 2);
      return;
    }
    case "build": {
      const lot = state.lots.find((l) => l.siteId === p.siteId)!;
      if (lot.ownerId === TOWN_ID && lot.complete) {
        const price = 2 * d.houseSalvage;
        if (ben.cash < price) return invalidAtWork(p, log, `can't afford the ${price} for a foreclosed house`);
        transfer(ben, state.treasury, "cash", price);
        lot.ownerId = ben.id;
        moveIn(ben, lot.siteId);
        log.emit({ kind: "house-complete", actors: [ben.id], siteId: lot.siteId, data: { bought: true, price }, text: `${ben.name} buys a foreclosed house.` });
        return;
      }
      if (!lot.ownerId) {
        if (ben.cash < d.lotPrice || ben.inventory.timber < d.houseTimber || ben.inventory.copper < d.houseCopper) {
          return invalidAtWork(p, log, `needs ${d.lotPrice} coins, ${d.houseTimber} timber and ${d.houseCopper} copper to start a house`);
        }
        transfer(ben, state.treasury, "cash", d.lotPrice);
        use("timber", d.houseTimber);
        use("copper", d.houseCopper);
        lot.ownerId = ben.id;
        lot.progress = 0;
        lot.required = d.houseLabour;
        log.emit({ kind: "house-started", actors: [ben.id], siteId: lot.siteId, text: `${ben.name} starts a house.` });
      }
      lot.progress = Math.round((lot.progress + m.skills.building * wf) * 1000) / 1000;
      if (lot.progress >= lot.required && !lot.complete) {
        lot.complete = true;
        moveIn(ben, lot.siteId);
        log.emit({ kind: "house-complete", actors: [ben.id], siteId: lot.siteId, text: `${ben.name}'s house is finished.` });
      }
      return;
    }
  }
}

function invalidAtWork(p: Plan, log: EventLog, why: string): void {
  p.valid = false;
  p.worked = false;
  p.reason = why;
  p.task = "rest";
  p.siteId = undefined;
  p.jobId = undefined;
  log.emit({ kind: "invalid-intent", actors: [p.miner.id], data: { why }, text: `${p.miner.name}: ${why}` });
}

function moveIn(m: MinerState, siteId: string): void {
  m.homeSiteId = siteId;
  m.homeKind = "house";
}

// ---------------------------------------------------------------- market

function runMarkets(state: WorldState, intents: (id: string) => Intent, log: EventLog, tally: Tally, trades: TradeFill[]): void {
  const s = state.shift;
  const holders = new Map<string, Holder>(state.miners.map((m) => [m.id, m]));
  holders.set("bank", state.bank);
  holders.set("treasury", state.treasury);
  const minerById = new Map(state.miners.map((m) => [m.id, m]));

  // Escrow: buy orders must be backed by cash, sells by goods. Unbacked orders are trimmed.
  const book: Record<Good, AuctionOrder[]> = { food: [], timber: [], copperOre: [], copper: [], gold: [] };
  for (const m of state.miners) {
    let cashLeft = m.cash;
    const goodsLeft = { ...m.inventory };
    for (const o of (intents(m.id).orders ?? []) as Order[]) {
      if (!o || !GOODS.includes(o.good) || (o.side !== "buy" && o.side !== "sell")) continue;
      const limit = Math.max(1, Math.min(1_000_000, Math.floor(Number(o.limit) || 0)));
      let qty = Math.max(0, Math.floor(Number(o.qty) || 0));
      if (o.side === "buy") {
        qty = Math.min(qty, Math.floor(cashLeft / limit));
        cashLeft -= qty * limit;
      } else {
        qty = Math.min(qty, goodsLeft[o.good]);
        goodsLeft[o.good] -= qty;
      }
      if (qty > 0) book[o.good].push({ participantId: m.id, side: o.side, qty, limit });
    }
  }
  // The soup kitchen stocks up from the valley's own farmers, bidding just under what importing costs.
  const want = reliefDemand(state);
  if (want > 0) {
    const tp = importPrice(state.worldPrices.food, state.dials);
    const limit = Math.max(1, Math.min(tp - 1, Math.round(state.prices.food.last * 1.1)));
    const qty = Math.min(want, Math.floor(state.treasury.cash / limit));
    if (qty > 0) book.food.push({ participantId: "treasury", side: "buy", qty, limit });
  }
  // The bank sells off anything it seized, cheaply.
  for (const g of GOODS) {
    const q = state.bank.inventory[g];
    if (q > 0) book[g].push({ participantId: "bank", side: "sell", qty: q, limit: Math.max(1, Math.floor(state.prices[g].last * 0.7)) });
  }

  for (const g of GOODS) {
    const orders = [...book[g], ...tradingPostOrders(g, state.worldPrices[g], state.dials)];
    const prevPrice = state.prices[g].last;
    const result = clearAuction(orders, prevPrice, keyedRng(state.seed, s, "auction", g));
    // Nobody sold metal this shift: quote what the outside world would pay now, so a price shock
    // shows up at once instead of waiting for the next sale.
    const quote = result.volume === 0 && (g === "copper" || g === "gold") ? exportPrice(g, state.worldPrices[g], state.dials) : result.price;
    state.prices[g] = { last: quote, volume: result.volume, bestBid: result.bestBid, bestAsk: result.bestAsk };
    if (result.volume === 0) continue;

    const price = result.price;
    const pool: Holder = { cash: 0, inventory: { food: 0, timber: 0, copperOre: 0, copper: 0, gold: 0 } };
    const tpBought = result.fills.filter((f) => f.participantId === TRADING_POST_ID && f.side === "buy").reduce((a, f) => a + f.qty, 0);
    const tpSold = result.fills.filter((f) => f.participantId === TRADING_POST_ID && f.side === "sell").reduce((a, f) => a + f.qty, 0);

    // Goods and cash flow into the clearing pool...
    for (const f of result.fills) {
      if (f.side === "sell") {
        if (f.participantId === TRADING_POST_ID) {
          create(state, pool, g, f.qty);
          tally.imports[g] += f.qty;
        } else transfer(holders.get(f.participantId)!, pool, g, f.qty);
      } else {
        if (f.participantId === TRADING_POST_ID) {
          create(state, pool, "cash", f.qty * price);
          tally.exportRevenue += f.qty * price;
        } else transfer(holders.get(f.participantId)!, pool, "cash", f.qty * price);
      }
    }
    // ...and back out.
    for (const f of result.fills) {
      if (f.side === "buy") {
        if (f.participantId === TRADING_POST_ID) {
          destroy(state, pool, g, f.qty);
          tally.exports[g] += f.qty;
        } else transfer(pool, holders.get(f.participantId)!, g, f.qty);
      } else {
        if (f.participantId === TRADING_POST_ID) {
          destroy(state, pool, "cash", f.qty * price);
          tally.importSpend += f.qty * price;
        } else {
          const seller = holders.get(f.participantId)!;
          transfer(pool, seller, "cash", f.qty * price);
          const m = minerById.get(f.participantId);
          if (m) {
            m.lastIncome += f.qty * price;
            // Export levy on the share of this sale that went abroad.
            if (tpBought > 0) {
              const levy = Math.floor(f.qty * price * state.dials.exportLevy * (tpBought / result.volume));
              if (levy > 0) transfer(m, state.treasury, "cash", Math.min(levy, m.cash));
            }
          }
        }
      }
      trades.push({ good: g, participantId: f.participantId, side: f.side, qty: f.qty, price });
    }
    if (pool.cash !== 0 || GOODS.some((x) => pool.inventory[x] !== 0)) throw new Error(`market pool for ${g} did not clear`);

    log.emit({
      kind: "market-clear",
      good: g,
      data: { price, volume: result.volume, tradingPostBought: tpBought, tradingPostSold: tpSold, participants: new Set(result.fills.map((f) => f.participantId)).size },
    });
    if (prevPrice > 0 && Math.abs(price - prevPrice) / prevPrice >= 0.2) {
      log.emit({ kind: "price-move", good: g, data: { from: prevPrice, to: price, change: Math.round(((price - prevPrice) / prevPrice) * 1000) / 1000 }, text: `${g} moved from ${prevPrice} to ${price}.` });
    }
  }
}

// ---------------------------------------------------------------- jobs and wages

function payWages(state: WorldState, plans: Plan[], log: EventLog): void {
  const rng = keyedRng(state.seed, state.shift, "wages");
  for (const p of rng.shuffle(plans.filter((x) => x.jobId))) {
    const job = state.jobs.find((j) => j.id === p.jobId);
    if (!job) continue;
    const employer = p.beneficiary;
    const pay = Math.min(job.wage, employer.cash);
    if (pay > 0) transfer(employer, p.miner, "cash", pay);
    p.miner.lastIncome += pay;
    if (pay < job.wage) {
      job.arrears++;
      log.emit({ kind: "wage-arrears", actors: [employer.id, p.miner.id], data: { jobId: job.id, owed: job.wage, paid: pay }, text: `${employer.name} couldn't pay ${p.miner.name} in full.` });
    }
  }
}

function manageJobs(ctx: SimContext, state: WorldState, intents: (id: string) => Intent, log: EventLog): void {
  const close = (job: Job, why: string) => {
    state.jobs = state.jobs.filter((j) => j !== job);
    log.emit({ kind: "job-closed", actors: [job.employerId], siteId: job.siteId, data: { jobId: job.id, why } });
  };
  for (const job of [...state.jobs]) if (job.arrears >= 3) close(job, "unpaid wages");

  for (const m of state.miners) {
    const it = intents(m.id);
    for (const id of it.cancelJobs ?? []) {
      const job = state.jobs.find((j) => j.id === id && j.employerId === m.id);
      if (job) close(job, "cancelled");
    }
    if (it.smelterFee !== undefined) {
      for (const sm of state.smelters) if (sm.ownerId === m.id) sm.fee = Math.max(0, Math.min(state.dials.maxSmelterFee, Math.floor(it.smelterFee)));
    }
    const offer = it.postJob;
    if (offer) {
      const wage = Math.floor(Number(offer.wage));
      const openings = Math.floor(Number(offer.openings));
      const problem =
        !(wage >= 1) ? "wage must be at least 1" :
        !(openings >= 1 && openings <= 10) ? "openings must be 1-10" :
        state.jobs.filter((j) => j.employerId === m.id).length >= 3 ? "at most 3 open jobs" :
        siteProblem(ctx, state, offer.task, offer.siteId, m);
      if (problem) {
        log.emit({ kind: "invalid-intent", actors: [m.id], data: { action: "postJob", why: problem } });
        continue;
      }
      const job: Job = { id: `J${state.nextJobId++}`, employerId: m.id, siteId: offer.siteId, task: offer.task, wage, openings, hiredLastShift: 0, arrears: 0, postedShift: state.shift };
      state.jobs.push(job);
      log.emit({ kind: "job-posted", actors: [m.id], siteId: job.siteId, data: { jobId: job.id, task: job.task, wage, openings } });
    }
  }
}

// ---------------------------------------------------------------- needs

function consume(state: WorldState, m: MinerState, intent: Intent, log: EventLog, tally: Tally): void {
  const d = state.dials;
  // Comforts wear off; buying more sends the money out of the valley.
  m.needs.comfort = clamp01(m.needs.comfort - d.comfortDecay);
  const spend = Math.min(m.cash, Math.max(0, Math.floor(Number(intent.spendOnComforts) || 0)));
  if (spend > 0) {
    destroy(state, m, "cash", spend);
    tally.comfortSpend += spend;
    m.needs.comfort = clamp01(m.needs.comfort + spend / d.comfortCost);
  }
  const before = m.needs.nourishment;
  m.needs.nourishment = clamp01(m.needs.nourishment - d.hungerPerShift);
  let meals = 0;
  while (m.needs.nourishment < d.eatBelow && m.inventory.food > 0 && meals < 2) {
    destroy(state, m, "food", 1);
    tally.consumed.food++;
    m.needs.nourishment = clamp01(m.needs.nourishment + d.mealNourishment);
    meals++;
  }
  spoil(state, m, keyedRng(state.seed, state.shift, "spoil", m.id), tally);

  if (m.homeSiteId) m.homeKind = "house";
  else if (m.cash >= d.bunkhouseRent) {
    if (d.bunkhouseRent > 0) transfer(m, state.treasury, "cash", d.bunkhouseRent);
    m.homeKind = "bunkhouse";
  } else m.homeKind = "rough";

  if (before >= 0.3 && m.needs.nourishment < 0.3) log.emit({ kind: "hunger", actors: [m.id], data: { nourishment: round4(m.needs.nourishment), cash: m.cash } });
  if (before > 0 && m.needs.nourishment <= 0 && m.inventory.food === 0) log.emit({ kind: "starving", actors: [m.id], data: { cash: m.cash }, text: `${m.name} is starving.` });
}

function spoil(state: WorldState, h: Holder, rng: ReturnType<typeof keyedRng>, tally: Tally): void {
  const q = Math.min(h.inventory.food, rng.roundStochastic(h.inventory.food * state.dials.foodSpoilage));
  if (q > 0) {
    destroy(state, h, "food", q);
    tally.consumed.food += q;
  }
}

function updateNeeds(state: WorldState, m: MinerState, worked: boolean, log: EventLog): void {
  const d = state.dials;
  const n = m.needs;
  n.energy = clamp01(worked ? n.energy - d.workEnergyCost : n.energy + d.restEnergyGain * REST_QUALITY[m.homeKind]);
  if (n.nourishment <= 0) n.health = clamp01(n.health - d.starvationHealthLoss);
  else n.health = clamp01(n.health + d.healthRecovery * (worked ? 1 : 2));
  n.shelter = SHELTER[m.homeKind];
  if (!m.collapsed && n.health <= 0) {
    m.collapsed = true;
    log.emit({ kind: "collapse", actors: [m.id], text: `${m.name} has collapsed and can't work.` });
  } else if (m.collapsed && n.health >= 0.5) m.collapsed = false;
}

function needsRelief(m: MinerState, d: WorldState["dials"]): boolean {
  return m.needs.nourishment < 0.4 && m.inventory.food === 0 && m.cash < d.reliefCashThreshold;
}

/** How much food the soup kitchen wants to buy at this shift's market (it stocks up for tonight). */
export function reliefDemand(state: WorldState): number {
  const d = state.dials;
  const likely = state.miners.filter((m) => m.needs.nourishment < 0.6 && m.inventory.food === 0 && m.cash < d.reliefCashThreshold).length;
  return Math.max(0, likely * d.reliefRations - state.treasury.inventory.food);
}

/**
 * The soup kitchen: hungry, nearly broke miners get rations. Food, not cash, so no brain (however
 * poor) can let a miner starve into a death spiral. The kitchen hands out what it bought from the
 * valley's own farmers at market first (keeping the money in the valley), and imports only the
 * shortfall. In lean times the town borrows from the bank to keep it open.
 */
function poorRelief(state: WorldState, log: EventLog, tally: Tally): void {
  const d = state.dials;
  const price = importPrice(state.worldPrices.food, d);
  const helped: string[] = [];
  let rations = 0;
  let imported = 0;
  let borrowed = 0;
  for (const m of state.miners) {
    if (!needsRelief(m, d)) continue;
    let q = Math.min(d.reliefRations, state.treasury.inventory.food);
    if (q > 0) transfer(state.treasury, m, "food", q);
    const short = d.reliefRations - q;
    if (short > 0) {
      const gap = short * price - state.treasury.cash;
      if (gap > 0) {
        const floor = Math.ceil(d.freezeReserveFraction * state.bank.initialReserves);
        const loan = Math.max(0, Math.min(gap, state.bank.cash - floor));
        if (loan > 0) {
          transfer(state.bank, state.treasury, "cash", loan);
          state.treasuryDebt += loan;
          borrowed += loan;
        }
      }
      const bought = Math.min(short, Math.floor(state.treasury.cash / price));
      if (bought > 0) {
        destroy(state, state.treasury, "cash", bought * price);
        create(state, m, "food", bought);
        tally.imports.food += bought;
        tally.importSpend += bought * price;
        imported += bought;
        q += bought;
      }
    }
    if (q <= 0) break;
    helped.push(m.id);
    rations += q;
  }
  if (helped.length) log.emit({ kind: "poor-relief", actors: helped, data: { miners: helped.length, rations, imported, borrowed }, causes: ["dial:reliefRations"] });
}

function wealthTax(state: WorldState): void {
  const { wealthTax: rate, wealthTaxExemption: exempt } = state.dials;
  if (rate <= 0) return;
  for (const m of state.miners) {
    const tax = Math.floor(Math.max(0, m.cash - exempt) * rate);
    if (tax > 0) transfer(m, state.treasury, "cash", tax);
  }
}

/** A tenth of the treasury above its reserve is shared equally each day, so rent and levies flow back. */
function townDividend(state: WorldState): void {
  // Pay back soup-kitchen credit first, from anything above half the reserve.
  if (state.treasuryDebt > 0) {
    const spare = state.treasury.cash - Math.floor(state.dials.treasuryReserve / 2);
    const repay = Math.max(0, Math.min(state.treasuryDebt, spare));
    if (repay > 0) {
      transfer(state.treasury, state.bank, "cash", repay);
      state.treasuryDebt -= repay;
    }
    if (state.treasuryDebt > 0) return;
  }
  const excess = state.treasury.cash - state.dials.treasuryReserve;
  if (excess <= 0 || !state.miners.length) return;
  const each = Math.floor((excess * 0.1) / state.miners.length);
  if (each < 1) return;
  for (const m of state.miners) transfer(state.treasury, m, "cash", each);
}

function lastPrices(state: WorldState): Record<Good, number> {
  return Object.fromEntries(GOODS.map((g) => [g, state.prices[g].last])) as Record<Good, number>;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
