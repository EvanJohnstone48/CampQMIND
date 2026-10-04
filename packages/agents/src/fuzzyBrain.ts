// The fuzzy brain: most of the town thinks this way, like AWARE's controllers.
//
// 1. Measure the miner's situation as numbers (hunger, savings in days, how good each kind of work pays...).
// 2. Fuzzify them into words with degrees ("hunger is high 0.7").
// 3. Fire the rule base (RULES below) to get a desirability for each kind of action, plus money moves.
// 4. Pick an action class by softmax over desirability (so the town doesn't stampede to one site),
//    then the best-paying site in that class.
// Every decision carries a trace of which rules fired, for the narrator and the Agents tab.
//
// To grow the rule base, add rules to RULES: they're plain data.

import { keyedRng, type Brain, type Intent, type Observation } from "@motherlode/shared";
import {
  HIGH,
  LOW,
  MEDIUM,
  NONE,
  VERY_HIGH,
  and,
  describe,
  fuzzify,
  infer,
  is,
  not,
  or,
  rule,
  shoulderLeft as low,
  shoulderRight as high,
  tri,
  variable,
  type Rule,
  type Variable,
} from "@motherlode/fuzzy";
import { CLASSES, houseCost, listOptions, market, worth, type ActionClass, type Option } from "./options";
import { traitsOf } from "./population";
import { moneyMoves, planTrades } from "./trade";

const WORK: ActionClass[] = ["farm", "chop", "dig", "digGold", "smelt", "work"];

export const VARIABLES: Variable[] = [
  variable("hunger", { low: low(0.2, 0.45), medium: tri(0.3, 0.5, 0.7), high: high(0.55, 0.8) }),
  variable("energy", { low: low(0.2, 0.45), medium: tri(0.3, 0.55, 0.8), high: high(0.65, 0.9) }),
  variable("health", { low: low(0.3, 0.6), ok: high(0.4, 0.7) }),
  variable("food", { none: low(0.5, 2), few: tri(0.5, 2.5, 5), plenty: high(4, 7) }),
  /** Days the miner could live on what they own. */
  variable("savings", { broke: low(1, 4), thin: tri(2, 6, 12), comfortable: tri(8, 15, 30), rich: high(20, 40) }),
  /** Debt in days of living costs. */
  variable("debt", { none: low(0, 1), some: tri(0.5, 4, 10), heavy: high(6, 15) }),
  variable("comfort", { low: low(0.2, 0.5), high: high(0.5, 0.8) }),
  /** How well the best work available pays, in shifts of living costs. */
  variable("pay", { poor: low(0.7, 1.5), decent: high(1, 3) }),
  variable("digRisk", { low: low(0.02, 0.05), high: high(0.03, 0.08) }),
  variable("rumour", { yes: high(0.5, 1) }),
  variable("shelter", { rough: low(0.1, 0.3) }),
  variable("canBuild", { yes: high(0.5, 1) }),
  variable("oreHeld", { lots: high(4, 10) }),
  /** 1 when a loan would close the gap to buying the house materials and lot. */
  variable("houseWithLoan", { yes: high(0.5, 1) }),
  variable("smeltSkill", { good: high(0.9, 1.2) }),
  variable("diligence", { low: low(0.3, 0.6), high: high(0.4, 0.7) }),
  variable("boldness", { low: low(0.3, 0.6), high: high(0.4, 0.7) }),
  variable("thrift", { low: low(0.3, 0.6), high: high(0.4, 0.7) }),
  // How each kind of work compares with the best on offer (1 = it IS the best).
  ...WORK.map((c) => variable(`${c}Pay`, { weak: low(0.4, 0.7), close: tri(0.55, 0.8, 0.97), best: high(0.85, 1) })),
  // What the miner did last shift (habit).
  ...WORK.map((c) => variable(`was${cap(c)}`, { yes: high(0.5, 1) })),
];

export const RULES: Rule[] = [
  // Resting
  rule("tired", is("energy", "low"), "rest", VERY_HIGH, 2),
  rule("sick", is("health", "low"), "rest", VERY_HIGH, 2),
  rule("fresh", is("energy", "high"), "rest", NONE),
  rule("lazy-afternoon", and(is("energy", "medium"), is("diligence", "low")), "rest", MEDIUM),
  rule("push-on", and(is("energy", "medium"), is("diligence", "high")), "rest", LOW),
  rule("retire", and(is("savings", "rich"), is("diligence", "low")), "rest", HIGH),
  rule("need-money", or(is("savings", "broke"), is("debt", "heavy")), "rest", NONE, 2),
  rule("not-worth-it", and(is("pay", "poor"), not(is("savings", "broke"))), "rest", MEDIUM),

  // Each kind of work: go where it pays.
  ...WORK.flatMap((c) => [
    rule(`${c}-best`, is(`${c}Pay`, "best"), c, HIGH),
    rule(`${c}-close`, is(`${c}Pay`, "close"), c, MEDIUM),
    rule(`${c}-weak`, is(`${c}Pay`, "weak"), c, NONE),
    rule(`${c}-too-tired`, or(is("energy", "low"), is("health", "low")), c, NONE, 2),
    // Habit: if what you did last shift still pays reasonably, you mostly keep at it. This gives the
    // town inertia, so it doesn't stampede between jobs (the El Farol problem).
    rule(`${c}-habit`, and(is(`was${cap(c)}`, "yes"), not(is(`${c}Pay`, "weak")), not(is("energy", "low"))), c, VERY_HIGH, 1.5),
  ]),

  // Particular situations
  rule("hungry-and-empty", and(is("hunger", "high"), is("food", "none")), "farm", VERY_HIGH, 2),
  rule("shaft-scares-me", and(is("digRisk", "high"), is("boldness", "low")), "dig", NONE, 2),
  rule("deep-is-fine", and(is("boldness", "high"), is("digPay", "close")), "dig", HIGH),
  rule("chase-the-rumour", and(is("rumour", "yes"), is("boldness", "high")), "digGold", VERY_HIGH, 2),
  rule("hear-the-rumour", and(is("rumour", "yes"), is("boldness", "low")), "digGold", MEDIUM),
  rule("steady-wage-when-broke", and(is("savings", "broke"), or(is("workPay", "close"), is("workPay", "best"))), "work", HIGH, 1.5),
  rule("smelt-my-ore", and(is("oreHeld", "lots"), is("smeltSkill", "good"), not(is("smeltPay", "weak"))), "smelt", HIGH, 1.5),
  rule("build-a-home", is("canBuild", "yes"), "build", VERY_HIGH, 2),
  rule("off-the-street", and(is("canBuild", "yes"), is("shelter", "rough")), "build", VERY_HIGH, 2),

  // Spending on comforts
  rule("treat-myself", and(is("savings", "rich"), is("comfort", "low")), "spend", HIGH),
  rule("well-off", is("savings", "rich"), "spend", LOW),
  rule("small-pleasures", and(is("savings", "comfortable"), is("comfort", "low"), is("thrift", "low")), "spend", MEDIUM),
  rule("penny-pincher", is("thrift", "high"), "spend", LOW),
  rule("cant-afford-it", or(is("savings", "broke"), is("savings", "thin")), "spend", NONE, 3),
  rule("content", is("comfort", "high"), "spend", NONE),

  // Borrowing and repaying
  // No borrowing to eat: the soup kitchen covers hunger, and food loans to the broke just default.
  rule("borrow-for-a-home", and(is("houseWithLoan", "yes"), is("debt", "none"), is("pay", "decent"), not(is("boldness", "low"))), "borrow", HIGH),
  rule("no-more-debt", or(is("debt", "some"), is("debt", "heavy")), "borrow", NONE, 3),
  rule("careful-with-credit", is("boldness", "low"), "borrow", LOW),
  rule("clear-debts", and(is("debt", "some"), or(is("savings", "comfortable"), is("savings", "rich"))), "repay", HIGH),
  rule("clear-heavy-debts", and(is("debt", "heavy"), not(is("savings", "broke"))), "repay", VERY_HIGH),
  rule("cant-repay", is("savings", "broke"), "repay", NONE, 2),
];

/** How sharply the brain prefers its top action class (smaller = greedier). */
const CLASS_TEMP = 0.1;

export interface FuzzyTrace {
  brain: "fuzzy";
  inputs: Record<string, [string, number]>;
  desire: Partial<Record<ActionClass, number>>;
  fired: { rule: string; text: string; strength: number }[];
  chose: string;
}

export interface FuzzyDecision {
  intent: Intent;
  options: Option[];
  chosen: Option;
  trace: FuzzyTrace;
}

/** Full decision with the reasoning, for callers (like the LLM brain) that want more than the intent. */
export function fuzzyDecide(obs: Observation, rules: Rule[] = RULES): FuzzyDecision {
  const me = obs.self;
  const p = traitsOf(me.traits).personality;
  const mk = market(obs);
  const options = listOptions(obs, mk);
  const rng = keyedRng(obs.seed, obs.shift, "fuzzy", me.id);

  // 1. Measure
  const bestBy = new Map<ActionClass, Option>();
  for (const o of options) if (!bestBy.has(o.cls) || o.income > bestBy.get(o.cls)!.income) bestBy.set(o.cls, o);
  const bestIncome = Math.max(1, ...WORK.map((c) => bestBy.get(c)?.income ?? 0));
  const net = worth(obs, mk);
  // Coins short of a house (materials + lot + a few days' buffer).
  const houseGap = Math.ceil(houseCost(obs, mk) + 3 * mk.costPerDay - me.cash);
  const inputs: Record<string, number> = {
    hunger: 1 - me.needs.nourishment,
    energy: me.needs.energy,
    health: me.needs.health,
    food: me.inventory.food,
    savings: Math.max(0, net) / mk.costPerDay,
    debt: me.debt / mk.costPerDay,
    comfort: me.needs.comfort,
    pay: bestIncome / (mk.costPerDay / 2),
    digRisk: bestBy.get("dig")?.risk ?? 0,
    rumour: obs.witnessed.some((e) => e.kind === "rumour") ? 1 : 0,
    shelter: me.home.kind === "rough" ? 0 : me.home.kind === "bunkhouse" ? 0.6 : 1,
    canBuild: bestBy.has("build") ? 1 : 0,
    oreHeld: me.inventory.copperOre,
    houseWithLoan: houseGap > 0 && houseGap <= obs.bank.myLimit && me.home.kind !== "house" && !me.ownedSites.some((id) => obs.sites.find((s) => s.id === id)?.kind === "houseLot") ? 1 : 0,
    smeltSkill: me.skills.smelting,
    ...p,
  };
  for (const c of WORK) {
    const o = bestBy.get(c);
    if (o) inputs[`${c}Pay`] = Math.max(0, o.income) / bestIncome;
    inputs[`was${cap(c)}`] = lastClass(obs) === c ? 1 : 0;
  }

  // 2-3. Fuzzify and fire the rules
  const degrees = fuzzify(VARIABLES, inputs);
  const res = infer(rules, degrees);

  // 4. Choose a class, then a site
  const available = CLASSES.filter((c) => bestBy.has(c));
  const desire: Partial<Record<ActionClass, number>> = {};
  for (const c of available) desire[c] = res.outputs[c] ?? (c === "rest" ? 0.3 : 0);
  const cls = softmaxPick(available, (c) => desire[c]!, CLASS_TEMP, rng.next());
  const inClass = options.filter((o) => o.cls === cls);
  const top = Math.max(...inClass.map((o) => o.income));
  const chosen = softmaxPick(inClass, (o) => o.income, Math.max(5, Math.abs(top) * 0.15), rng.next());

  const plan = planTrades(obs, mk, cls, p);
  const money = moneyMoves(obs, mk, net, res.outputs.spend ?? 0, res.outputs.borrow ?? 0, res.outputs.repay ?? 0, Math.max(0, houseGap));
  const why = res.firings.find((f) => f.output === cls);
  const trace: FuzzyTrace = {
    brain: "fuzzy",
    inputs: pick(describe(degrees), ["hunger", "energy", "health", "food", "savings", "debt", "pay", `${cls}Pay`]),
    desire,
    // Rules behind the chosen action first, then the rest.
    fired: [...res.firings.filter((f) => f.output === cls), ...res.firings.filter((f) => f.output !== cls)].slice(0, 6).map((f) => ({ rule: f.ruleId, text: f.text, strength: f.strength })),
    chose: chosen.label,
  };
  const intent: Intent = {
    action: chosen.action,
    ...plan,
    ...money,
    reason: why ? `${chosen.label}: ${why.text} (${why.strength.toFixed(2)})` : chosen.label,
    trace,
  };
  return { intent, options, chosen, trace };
}

export const fuzzyBrain: Brain = (obs) => fuzzyDecide(obs).intent;

/** Which class of work the miner did last shift (from where they ended up). */
function lastClass(obs: Observation): ActionClass | undefined {
  const me = obs.self;
  if (me.lastAction === "rest") return "rest";
  if (me.employment && me.lastAction !== "rest") return "work";
  if (me.lastAction === "dig") return obs.sites.find((s) => s.id === me.location)?.ore === "gold" ? "digGold" : "dig";
  return CLASSES.includes(me.lastAction as ActionClass) ? (me.lastAction as ActionClass) : undefined;
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function softmaxPick<T>(items: T[], score: (t: T) => number, temp: number, u: number): T {
  const scores = items.map(score);
  const max = Math.max(...scores);
  const w = scores.map((s) => Math.exp((s - max) / temp));
  let x = u * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    x -= w[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pick<T>(obj: Record<string, T>, keys: string[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of keys) if (obj[k]) out[k] = obj[k];
  return out;
}
