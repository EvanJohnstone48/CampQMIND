// The baseline brain: a simple greedy miner so the world can run without Lane 2, and a
// reference for Lane 2's brains to beat. Each shift it scores every action by the change
// in well-being it expects (money is durable, so its effect counts a few times over;
// tiredness recovers, so it counts once), and picks the best with a little seeded noise.

import { keyedRng, type Good, type Intent, type JobOffer, type Observation, type Order, type SiteView } from "@motherlode/shared";
import { crowdFactor, workFactor } from "./production";
import { REST_QUALITY, costOfLivingPerDay, needUtility, security, NEED_WEIGHTS } from "./wellbeing";

/** How many shifts the brain treats extra money as lasting. */
const MONEY_HORIZON = 3;
/** Tiredness recovers with one rest, so a shift's energy change counts for less than money. */
const ENERGY_WEIGHT = 0.5;
/** Days of living costs kept as savings before spending on comforts. */
const SAVINGS_DAYS = 20;
/** How sharply the brain prefers its best option (smaller = greedier). */
const SOFTMAX_TEMP = 0.006;
/** Moving to a new site means unknown crowding; staying put is a known quantity. */
const STAY_BONUS = 1.1;

interface Candidate {
  action: Intent["action"];
  income: number;
  works: boolean;
  bonus?: number;
  label: string;
}

export function baselineBrain(obs: Observation): Intent {
  const me = obs.self;
  const d = obs.dials;
  const rng = keyedRng(obs.seed, obs.shift, "baseline", me.id);
  const last = (g: Good) => obs.prices[g].last;
  const tpBuy = (g: Good) => obs.tradingPost.buys[g] ?? 0;
  const tpSell = (g: Good) => obs.tradingPost.sells[g] ?? Infinity;
  const value = (g: Good) => Math.max(last(g), tpBuy(g));

  const smelter = obs.sites.find((s) => s.kind === "smelter");
  const ownsSmelter = !!smelter && smelter.ownerId === me.id;
  const fee = ownsSmelter ? 0 : smelter?.fee ?? 0;
  const orePerCopper = 2;
  const smeltValuePerOre = Math.max(0, value("copper") / orePerCopper - d.smeltFuel * last("timber") - fee);

  const myLot = obs.sites.find((s) => s.kind === "houseLot" && s.ownerId === me.id);
  const hasHouse = me.home.kind === "house";
  const houseCost = d.lotPrice + d.houseTimber * last("timber") + d.houseCopper * last("copper");
  const savingForHouse = !hasHouse && !myLot && me.cash + me.inventory.copper * last("copper") + me.inventory.timber * last("timber") >= houseCost + 300;
  const haveMaterials = me.inventory.timber >= d.houseTimber && me.inventory.copper >= d.houseCopper;

  // ---- candidate actions
  const cands: Candidate[] = [{ action: { type: "rest" }, income: 0, works: false, label: "rest" }];
  const stay = (s: SiteView) => (me.location === s.id ? STAY_BONUS : 1);
  const wfAt = (s: SiteView) => workFactor(me.needs.energy, me.needs.health, s.travel) * stay(s);
  const crowdAt = (s: SiteView) => crowdFactor(s.workersLastShift + (me.location === s.id ? 0 : 1), s.capacity);
  const rumoured = new Set(obs.witnessed.filter((e) => e.kind === "rumour" && e.siteId).map((e) => e.siteId!));

  for (const s of obs.sites) {
    if (s.kind === "farm" && (s.commons || s.ownerId === me.id)) {
      const rate = d.farmYield * me.skills.farming * (s.fertility ?? 1);
      cands.push({ action: { type: "farm", siteId: s.id }, income: rate * crowdAt(s) * wfAt(s) * value("food"), works: true, label: `farm ${s.id}` });
    }
    if (s.kind === "forest") {
      const rate = d.chopYield * me.skills.chopping * Math.sqrt(s.stockFraction ?? 0);
      cands.push({ action: { type: "chop", siteId: s.id }, income: rate * crowdAt(s) * wfAt(s) * value("timber"), works: true, label: `chop ${s.id}` });
    }
    if (s.kind === "vein" && !s.exhausted) {
      const gold = s.ore === "gold";
      const prior = (gold ? d.goldYield : d.digYield) * me.skills.mining * 0.8;
      let rate = me.veinYield[s.id] ?? prior;
      if (rumoured.has(s.id)) rate = Math.max(rate, prior) * 3;
      const unitValue = gold ? value("gold") : Math.max(last("copperOre"), smeltValuePerOre * 0.8);
      const risk = d.caveInRisk * (1 + (s.unsupportedDepth ?? 0)) * 1.2;
      const typical = Math.max(40, avg(me.lastIncome, 60));
      const riskCost = risk * d.injuryShifts * typical * (1.5 - me.riskAppetite);
      cands.push({ action: { type: "dig", siteId: s.id }, income: rate * crowdAt(s) * wfAt(s) * unitValue - riskCost, works: true, label: `dig ${s.id}` });
    }
  }

  // Smelting turns ore you hold into copper. Its worth is the copper minus what the ore would
  // realistically fetch on a thin market, the fuel and the fee.
  const oreResale = value("copperOre");
  if (smelter && me.inventory.copperOre >= 2) {
    const ore = Math.min(Math.floor(d.smeltCapacity * me.skills.smelting * wfAt(smelter)), me.inventory.copperOre);
    const fuel = Math.ceil(ore * d.smeltFuel);
    if (ore >= 2 && me.inventory.timber >= fuel) {
      const gain = (ore / orePerCopper) * value("copper") - ore * oreResale - fuel * last("timber") - ore * fee;
      cands.push({ action: { type: "smelt", siteId: smelter.id }, income: gain, works: true, label: "smelt" });
    }
  }

  if (myLot && myLot.building && !myLot.building.complete) {
    cands.push({ action: { type: "build", siteId: myLot.id }, income: 0, works: true, bonus: 0.06, label: "build my house" });
  } else if (!hasHouse && !myLot) {
    const forSale = obs.sites.filter((s) => s.kind === "houseLot" && s.ownerId === "town" && s.building?.complete);
    const empty = obs.sites.filter((s) => s.kind === "houseLot" && !s.ownerId).sort((a, b) => a.travel - b.travel);
    if (forSale.length && me.cash >= 2 * d.houseSalvage + 200) {
      cands.push({ action: { type: "build", siteId: forSale[0].id }, income: 0, works: true, bonus: 0.08, label: "buy a house" });
    } else if (empty.length && haveMaterials && me.cash >= d.lotPrice + 100) {
      cands.push({ action: { type: "build", siteId: empty[0].id }, income: 0, works: true, bonus: 0.08, label: "start a house" });
    }
  }

  // Keep the job you have; otherwise only look at a few postings, so everyone doesn't pile onto one.
  for (const j of obs.jobs) {
    if (j.employerId === me.id || j.arrears >= 2) continue;
    const mine = me.employment?.jobId === j.id;
    if (!mine && j.hiredLastShift >= j.openings) continue;
    if (!mine && !rng.chance(Math.min(1, 0.05 * (j.openings - j.hiredLastShift)))) continue;
    cands.push({ action: { type: "work", jobId: j.id }, income: j.wage * (mine ? 1 : 0.85), works: true, label: `work ${j.id}` });
  }

  // ---- score by expected change in well-being
  const col = costOfLivingPerDay(last("food"), d);
  const worth = me.cash - me.debt + me.inventory.food * last("food") + me.inventory.timber * last("timber");
  const secNow = security(worth, col);
  const restGain = d.restEnergyGain * REST_QUALITY[me.home.kind];
  const scoreOf = (c: Candidate) => {
    const dMoney = NEED_WEIGHTS.security * (needUtility(security(worth + Math.max(0, c.income), col)) - needUtility(secNow));
    const loss = c.income < 0 ? NEED_WEIGHTS.security * (needUtility(secNow) - needUtility(security(worth + c.income, col))) : 0;
    // Energy can't go below zero in the world, but working while exhausted still costs: extend
    // the curve linearly below zero so an empty tank makes rest look as good as it is.
    const e1 = c.works ? me.needs.energy - d.workEnergyCost : Math.min(1, me.needs.energy + restGain);
    const dEnergy = ENERGY_WEIGHT * NEED_WEIGHTS.energy * (energyUtility(e1) - energyUtility(me.needs.energy));
    return MONEY_HORIZON * (dMoney - loss) + dEnergy + (c.bonus ?? 0) + rng.normal() * 0.004;
  };
  // Choose by softmax, not argmax: if everyone takes "the best" site they all crowd it
  // (El Farol). Near-equal options get near-equal odds, which spreads the town out.
  const scored = cands.map((c) => ({ c, score: scoreOf(c) })).sort((a, b) => b.score - a.score);
  const weights = scored.map((x) => Math.exp((x.score - scored[0].score) / SOFTMAX_TEMP));
  let pick = rng.next() * weights.reduce((a, b) => a + b, 0);
  let chosen = scored[0];
  for (let i = 0; i < scored.length; i++) {
    pick -= weights[i];
    if (pick <= 0) {
      chosen = scored[i];
      break;
    }
  }
  const best = chosen.c;
  const action = best.action;
  const smelting = action.type === "smelt";
  const digging = action.type === "dig";

  // ---- market orders
  const orders: Order[] = [];
  const buy = (good: Good, qty: number, limit: number) => {
    const l = Math.floor(Math.min(limit, 1_000_000));
    if (qty > 0 && l >= 1) orders.push({ good, side: "buy", qty, limit: l });
  };
  const sell = (good: Good, qty: number, limit: number) => {
    if (qty > 0) orders.push({ good, side: "sell", qty, limit: Math.max(1, Math.floor(limit)) });
  };
  // Ask for a bit under the going rate, but if nothing traded last shift the "going rate" is
  // stale: fall back to what the Trading Post pays, or the market can deadlock on an old price.
  const surplusAsk = (g: Good) => (obs.prices[g].volume > 0 ? Math.max(tpBuy(g), last(g) * 0.85) : tpBuy(g));

  const food = me.inventory.food;
  if (food < 4) {
    // Pay up to the import price, but only for what we can afford.
    const want = 4 - food + (me.needs.nourishment < 0.4 ? 1 : 0);
    const limit = tpSell("food");
    const afford = Math.floor(me.cash / limit);
    if (afford >= 1) buy("food", Math.min(want, afford), limit);
    else if (me.cash >= 1) buy("food", 1, me.cash);
  } else if (food > 5) sell("food", food - 5, surplusAsk("food"));

  let timberNeed = 0;
  if (digging) timberNeed += 2 * d.supportTimber;
  if (me.inventory.copperOre >= 2 || smelting) timberNeed += Math.ceil(Math.max(me.inventory.copperOre, 6) * d.smeltFuel);
  if (savingForHouse) timberNeed += d.houseTimber;
  if (me.inventory.timber < timberNeed) buy("timber", timberNeed - me.inventory.timber, Math.min(tpSell("timber"), last("timber") * 1.3 + 2));
  else if (me.inventory.timber > timberNeed + 3) sell("timber", me.inventory.timber - timberNeed - 2, surplusAsk("timber"));

  // Clumsy smelters sell their ore on; skilled ones (and the smelter's owner) buy it up.
  const goodSmelter = me.skills.smelting >= 1 || ownsSmelter;
  const canAffordSmelting = me.cash >= fee * Math.min(me.inventory.copperOre, d.smeltCapacity) + 30;
  if (me.inventory.copperOre > 0 && !smelting && (!goodSmelter || !canAffordSmelting)) {
    sell("copperOre", me.inventory.copperOre, Math.max(tpBuy("copperOre"), smeltValuePerOre * 0.5));
  } else if (goodSmelter && me.cash > 150 && me.inventory.copperOre < 12 && smeltValuePerOre * 0.8 > tpBuy("copperOre")) {
    buy("copperOre", 12 - me.inventory.copperOre, Math.max(1, smeltValuePerOre * 0.8));
  }

  const keepCopper = savingForHouse ? d.houseCopper : 0;
  if (me.inventory.copper > keepCopper) sell("copper", me.inventory.copper - keepCopper, tpBuy("copper") * 0.5);
  else if (me.inventory.copper < keepCopper) buy("copper", keepCopper - me.inventory.copper, tpSell("copper"));
  if (me.inventory.gold > 0) sell("gold", me.inventory.gold, tpBuy("gold") * 0.5);

  // ---- comforts: only from savings above ~20 days of living, and only when the pleasure
  // is worth more than the (lasting) security it costs
  const c0 = Math.max(0, me.needs.comfort - d.comfortDecay);
  const surplus = Math.min(me.cash, worth - SAVINGS_DAYS * col);
  let spend = 0;
  let spendScore = 0;
  for (const amount of [20, 40, 80, 160, 320, 640]) {
    if (amount > surplus) break;
    const gain = NEED_WEIGHTS.comfort * (needUtility(c0 + amount / d.comfortCost) - needUtility(c0));
    const cost = MONEY_HORIZON * NEED_WEIGHTS.security * (needUtility(secNow) - needUtility(security(worth - amount, col)));
    const sc = gain - cost;
    if (sc > spendScore) {
      spend = amount;
      spendScore = sc;
    }
  }

  // ---- borrowing and repaying
  const intent: Intent = {
    action,
    orders,
    reason: best.label,
    trace: { brain: "baseline", top: scored.slice(0, 4).map((x) => ({ option: x.c.label, income: Math.round(x.c.income), score: Math.round(x.score * 10000) / 10000 })) },
  };
  if (me.debt === 0 && obs.bank.lending && obs.bank.myLimit > 0) {
    // Borrow to eat only with some income to repay from; otherwise the soup kitchen is the fallback.
    if (food < 2 && me.cash < tpSell("food") * 2 && me.lastIncome > 20) intent.borrow = Math.min(150, obs.bank.myLimit);
    else if (!hasHouse && !myLot && me.riskAppetite > 0.6 && me.lastIncome > 60 && me.cash + obs.bank.myLimit >= houseCost + 200 && me.cash < houseCost) {
      intent.borrow = Math.min(obs.bank.myLimit, Math.ceil(houseCost - me.cash + 100));
    }
  } else if (me.debt > 0 && me.cash > 500) {
    intent.repay = Math.min(me.debt, me.cash - 400);
  }

  // ---- being an employer
  const myJobs = obs.jobs.filter((j) => j.employerId === me.id);
  const cancel: string[] = [];
  let post: JobOffer | undefined;
  for (const s of obs.sites) {
    if (s.kind === "farm" && s.ownerId === me.id && !s.commons) {
      const job = myJobs.find((j) => j.siteId === s.id);
      const wage = Math.floor(d.farmYield * (s.fertility ?? 1) * 0.8 * value("food") * 0.6);
      if (!job && !post && me.cash >= wage * 6 && wage >= 5 && !(action.type === "farm" && action.siteId === s.id)) post = { siteId: s.id, task: "farm", wage, openings: 2 };
      if (job && me.cash < job.wage * 2) cancel.push(job.id);
    }
  }
  if (ownsSmelter && smelter) {
    const job = myJobs.find((j) => j.siteId === smelter.id);
    const perShift = Math.floor((d.smeltCapacity / orePerCopper) * value("copper") - d.smeltCapacity * Math.max(last("copperOre"), 1));
    if (!job && !post && me.inventory.copperOre >= 12 && perShift > 20) post = { siteId: smelter.id, task: "smelt", wage: Math.floor(perShift * 0.5), openings: 1 };
    if (job && me.inventory.copperOre < 4) cancel.push(job.id);
    // Simple dynamic pricing: busy smelter -> raise fee; idle -> cut it. Never above the town cap.
    const used = smelter.workersLastShift;
    const fee0 = smelter.fee ?? 0;
    const nextFee = Math.min(d.maxSmelterFee, used >= smelter.capacity ? fee0 + 1 : used === 0 ? Math.max(2, fee0 - 1) : fee0);
    if (nextFee !== smelter.fee) intent.smelterFee = nextFee;
  }
  if (spend > 0) intent.spendOnComforts = spend;
  if (post) intent.postJob = post;
  if (cancel.length) intent.cancelJobs = cancel;
  return intent;
}

function energyUtility(e: number): number {
  return e >= 0 ? needUtility(e) : (9 / Math.LN10) * e;
}

function avg(a: number, b: number): number {
  return (a + b) / 2;
}
