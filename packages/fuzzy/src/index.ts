// A tiny fuzzy-logic library: "how much" instead of yes/no.
//
//   const hunger = variable("hunger", { low: shoulderLeft(0.2, 0.5), high: shoulderRight(0.5, 0.8) });
//   const degrees = fuzzify([hunger], { hunger: 0.7 });          // hunger is high to degree 0.67
//   const rules = [rule("eat", is("hunger", "high"), "farm", HIGH)];
//   const { outputs, firings } = infer(rules, degrees);           // farm desirability + which rules fired
//
// Inference is zero-order Sugeno: each rule's consequent is a crisp value, and an output is the
// strength-weighted average of the rules that fired. It's fast, and every number traces back
// to named rules, which is what the narrator (and AWARE-NG) needs.

/** A membership function: how strongly x belongs to a term, from 0 to 1. */
export type MembershipFn = (x: number) => number;

/** Triangle: 0 at a, 1 at b, 0 at c. */
export function tri(a: number, b: number, c: number): MembershipFn {
  return (x) => (x <= a || x >= c ? 0 : x === b ? 1 : x < b ? (x - a) / (b - a) : (c - x) / (c - b));
}

/** Trapezoid: 0 at a, 1 from b to c, 0 at d. */
export function trap(a: number, b: number, c: number, d: number): MembershipFn {
  return (x) => (x <= a || x >= d ? 0 : x >= b && x <= c ? 1 : x < b ? (x - a) / (b - a) : (d - x) / (d - c));
}

/** 1 up to a, falling to 0 at b ("low"). */
export function shoulderLeft(a: number, b: number): MembershipFn {
  return (x) => (x <= a ? 1 : x >= b ? 0 : (b - x) / (b - a));
}

/** 0 up to a, rising to 1 at b ("high"). */
export function shoulderRight(a: number, b: number): MembershipFn {
  return (x) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a));
}

export interface Variable {
  name: string;
  terms: Record<string, MembershipFn>;
}

export function variable(name: string, terms: Record<string, MembershipFn>): Variable {
  return { name, terms };
}

/** variable -> term -> degree. */
export type Degrees = Record<string, Record<string, number>>;

export function fuzzify(vars: Variable[], inputs: Record<string, number>): Degrees {
  const out: Degrees = {};
  for (const v of vars) {
    const x = inputs[v.name];
    if (x === undefined || !Number.isFinite(x)) continue;
    out[v.name] = {};
    for (const [term, mf] of Object.entries(v.terms)) out[v.name][term] = round(clamp01(mf(x)));
  }
  return out;
}

/** The strongest term of each variable, e.g. { hunger: ["high", 0.67] }. Handy for traces. */
export function describe(degrees: Degrees): Record<string, [string, number]> {
  const out: Record<string, [string, number]> = {};
  for (const [v, terms] of Object.entries(degrees)) {
    let best: [string, number] = ["?", 0];
    for (const [t, d] of Object.entries(terms)) if (d > best[1]) best = [t, d];
    out[v] = best;
  }
  return out;
}

// ---------------------------------------------------------------- conditions

export type Condition =
  | { is: [variable: string, term: string] }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

export const is = (variable: string, term: string): Condition => ({ is: [variable, term] });
export const and = (...conds: Condition[]): Condition => ({ and: conds });
export const or = (...conds: Condition[]): Condition => ({ or: conds });
export const not = (cond: Condition): Condition => ({ not: cond });

/** Truth of a condition: AND = min, OR = max, NOT = 1 - x. Unknown variables or terms count as 0. */
export function evaluate(cond: Condition, degrees: Degrees): number {
  if ("is" in cond) return degrees[cond.is[0]]?.[cond.is[1]] ?? 0;
  if ("and" in cond) return cond.and.length ? Math.min(...cond.and.map((c) => evaluate(c, degrees))) : 0;
  if ("or" in cond) return cond.or.length ? Math.max(...cond.or.map((c) => evaluate(c, degrees))) : 0;
  return 1 - evaluate(cond.not, degrees);
}

export function conditionText(cond: Condition): string {
  if ("is" in cond) return `${cond.is[0]} is ${cond.is[1]}`;
  if ("and" in cond) return cond.and.map((c) => wrap(c)).join(" AND ");
  if ("or" in cond) return cond.or.map((c) => wrap(c)).join(" OR ");
  return `NOT ${wrap(cond.not)}`;
}

function wrap(c: Condition): string {
  return "is" in c || "not" in c ? conditionText(c) : `(${conditionText(c)})`;
}

// ---------------------------------------------------------------- rules

/** Named consequent levels, so rules read like sentences. */
export const NONE = 0;
export const LOW = 0.15;
export const MEDIUM = 0.5;
export const HIGH = 0.85;
export const VERY_HIGH = 1;

export interface Rule {
  id: string;
  if: Condition;
  then: { output: string; value: number };
  /** Scales the rule's pull (personality uses this). Default 1. */
  weight?: number;
}

export function rule(id: string, cond: Condition, output: string, value: number, weight = 1): Rule {
  return { id, if: cond, then: { output, value }, weight };
}

const textCache = new WeakMap<Rule, string>();

export function ruleText(r: Rule): string {
  let t = textCache.get(r);
  if (t === undefined) {
    t = `IF ${conditionText(r.if)} THEN ${r.then.output} is ${levelName(r.then.value)}`;
    textCache.set(r, t);
  }
  return t;
}

export interface Firing {
  ruleId: string;
  /** How true the rule's condition was (0..1). */
  strength: number;
  output: string;
  value: number;
  text: string;
}

export interface Inference {
  /** Strength-weighted average consequent per output. Outputs no rule touched are absent. */
  outputs: Record<string, number>;
  /** Total firing strength per output: how much evidence there was. */
  support: Record<string, number>;
  /** Every rule that fired, strongest first. */
  firings: Firing[];
}

export function infer(rules: Rule[], degrees: Degrees, minStrength = 0.01): Inference {
  const num: Record<string, number> = {};
  const den: Record<string, number> = {};
  const firings: Firing[] = [];
  for (const r of rules) {
    const strength = evaluate(r.if, degrees);
    if (strength < minStrength) continue;
    const w = strength * (r.weight ?? 1);
    if (w <= 0) continue;
    const o = r.then.output;
    num[o] = (num[o] ?? 0) + w * r.then.value;
    den[o] = (den[o] ?? 0) + w;
    firings.push({ ruleId: r.id, strength: round(strength), output: o, value: r.then.value, text: ruleText(r) });
  }
  const outputs: Record<string, number> = {};
  const support: Record<string, number> = {};
  for (const o of Object.keys(num)) {
    outputs[o] = round(num[o] / den[o]);
    support[o] = round(den[o]);
  }
  firings.sort((a, b) => b.strength - a.strength || (a.ruleId < b.ruleId ? -1 : 1));
  return { outputs, support, firings };
}

function levelName(v: number): string {
  if (v === NONE) return "none";
  if (v === LOW) return "low";
  if (v === MEDIUM) return "medium";
  if (v === HIGH) return "high";
  if (v === VERY_HIGH) return "very high";
  return String(v);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function round(x: number): number {
  return Math.round(x * 10000) / 10000;
}
