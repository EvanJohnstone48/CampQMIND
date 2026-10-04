// The LLM brain for a share of the town.
//
// The free Gemini tier allows ~10-15 requests a minute, nowhere near "every miner every shift".
// So an LLM miner makes a *plan* (one option, chosen by the model with a reason) and follows it
// for a few shifts, re-planning sooner when something notable happens. Calls share a
// requests-per-minute budget; anything late, broken or over budget falls back to the fuzzy brain.
// Each miner keeps a short memory of what it did, earned and thought.

import type { Intent, Observation } from "@motherlode/shared";
import { fuzzyDecide } from "../fuzzyBrain";
import { market, worth, type Option } from "../options";
import { traitsOf } from "../population";
import { planTrades } from "../trade";
import { costUsd, type LlmClient } from "./gemini";
import { answerSchema, parseAnswer, systemPrompt, userPrompt, type LlmAnswer, type MemoryEntry } from "./prompt";

export interface LlmMindOptions {
  client: LlmClient;
  /** Requests per minute across all LLM miners (free tier: ~10 for 2.5 Flash-Lite... check your quota). */
  rpm: number;
  /** Hard cap on requests per calendar day. */
  dailyCap: number;
  /** How long to wait for one answer before falling back. */
  timeoutMs: number;
  /** Re-plan at least this often (shifts). */
  replanEvery: number;
  /** Options shown to the model. */
  maxOptions: number;
  /** Clock, for the budget (injectable for tests). */
  now: () => number;
}

export interface LlmStats {
  model: string;
  calls: number;
  ok: number;
  failed: number;
  timedOut: number;
  invalid: number;
  /** Shifts where an LLM miner followed its existing plan. */
  planFollowed: number;
  /** Shifts where an LLM miner had to use the fuzzy brain (no plan, over budget, or a failed call). */
  fuzzyFallback: number;
  inputTokens: number;
  outputTokens: number;
  /** What these calls would cost on the paid tier (free tier: $0). */
  estimatedUsd: number;
  lastError?: string;
}

export interface LlmTrace {
  brain: "llm";
  source: "llm" | "plan" | "fuzzy";
  thought?: string;
  choice?: string;
  planShift?: number;
  options?: { key: string; income: number }[];
  error?: string;
  /** The fuzzy reasoning, when the fuzzy brain stepped in. */
  fuzzy?: unknown;
}

interface Plan {
  key: string;
  shift: number;
  thought: string;
}

const NOTABLE = new Set(["act-of-god", "god-power", "rumour", "cave-in", "loan-default", "credit-freeze"]);

export class LlmMind {
  private readonly opts: LlmMindOptions;
  private readonly plans = new Map<string, Plan>();
  private readonly memory = new Map<string, MemoryEntry[]>();
  private readonly lastThought = new Map<string, { shift: number; thought: string }>();
  private tokens: number;
  private lastRefill: number;
  private day = "";
  private callsToday = 0;
  private readonly s: LlmStats;

  constructor(opts: Partial<LlmMindOptions> & { client: LlmClient }) {
    // Unset options (undefined) keep their defaults.
    const given = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
    this.opts = { rpm: 10, dailyCap: 1000, timeoutMs: 8000, replanEvery: 6, maxOptions: 8, now: Date.now, ...given } as LlmMindOptions;
    this.tokens = this.opts.rpm;
    this.lastRefill = this.opts.now();
    this.s = { model: opts.client.model, calls: 0, ok: 0, failed: 0, timedOut: 0, invalid: 0, planFollowed: 0, fuzzyFallback: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
  }

  stats(): LlmStats {
    return { ...this.s, estimatedUsd: Math.round(this.s.estimatedUsd * 1e6) / 1e6 };
  }

  async decide(observations: Observation[]): Promise<Record<string, Intent>> {
    const out: Record<string, Intent> = {};
    const prepared = observations.map((obs) => {
      this.remember(obs);
      return { obs, fuzzy: fuzzyDecide(obs) };
    });

    // Who needs a fresh plan, most urgent first.
    const due = prepared
      .map((p) => ({ p, urgency: this.urgency(p.obs, p.fuzzy.options) }))
      .filter((x) => x.urgency > 0)
      .sort((a, b) => b.urgency - a.urgency || (a.p.obs.self.id < b.p.obs.self.id ? -1 : 1));
    const budget = this.takeBudget(due.length);
    const calling = new Set(due.slice(0, budget).map((x) => x.p.obs.self.id));

    await Promise.all(
      prepared.map(async ({ obs, fuzzy }) => {
        const id = obs.self.id;
        // Too tired or hurt to follow any plan: let the fuzzy rules (which rest) take over.
        const spent = obs.self.needs.energy < 0.25 || obs.self.needs.health < 0.35;
        if (calling.has(id) && !spent) {
          const res = await this.ask(obs, fuzzy.options);
          if (res.answer) {
            out[id] = this.intentFrom(obs, fuzzy.options, res.answer.choice, res.answer, { brain: "llm", source: "llm", thought: res.answer.thought, choice: res.answer.choice, options: res.shown });
            this.plans.set(id, { key: res.answer.choice, shift: obs.shift, thought: res.answer.thought });
            this.lastThought.set(id, { shift: obs.shift, thought: res.answer.thought });
            return;
          }
          out[id] = { ...fuzzy.intent, trace: { brain: "llm", source: "fuzzy", error: res.error, fuzzy: fuzzy.trace } satisfies LlmTrace };
          this.s.fuzzyFallback++;
          return;
        }
        const plan = this.plans.get(id);
        if (plan && !spent && fuzzy.options.some((o) => o.key === plan.key)) {
          out[id] = this.intentFrom(obs, fuzzy.options, plan.key, undefined, { brain: "llm", source: "plan", thought: plan.thought, choice: plan.key, planShift: plan.shift });
          this.s.planFollowed++;
          return;
        }
        out[id] = { ...fuzzy.intent, trace: { brain: "llm", source: "fuzzy", fuzzy: fuzzy.trace } satisfies LlmTrace };
        this.s.fuzzyFallback++;
      }),
    );
    return out;
  }

  /** 0 = no call needed. Notable events beat having no plan, which beats a stale plan. */
  private urgency(obs: Observation, options: Option[]): number {
    const plan = this.plans.get(obs.self.id);
    if (obs.witnessed.some((e) => NOTABLE.has(e.kind))) return 3;
    if (!plan) return 2;
    if (!options.some((o) => o.key === plan.key)) return 2;
    if (obs.shift - plan.shift >= this.opts.replanEvery) return 1 + Math.min(0.9, (obs.shift - plan.shift) / 100);
    return 0;
  }

  private takeBudget(wanted: number): number {
    const now = this.opts.now();
    this.tokens = Math.min(this.opts.rpm, this.tokens + ((now - this.lastRefill) / 60_000) * this.opts.rpm);
    this.lastRefill = now;
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.callsToday = 0;
    }
    const n = Math.max(0, Math.min(wanted, Math.floor(this.tokens), this.opts.dailyCap - this.callsToday));
    this.tokens -= n;
    this.callsToday += n;
    return n;
  }

  private async ask(obs: Observation, all: Option[]): Promise<{ answer?: LlmAnswer; error?: string; shown?: { key: string; income: number }[] }> {
    const shown = menu(obs, all, this.opts.maxOptions);
    const keys = shown.map((o) => o.key);
    const mk = market(obs);
    const traits = traitsOf(obs.self.traits);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    this.s.calls++;
    try {
      const res = await this.opts.client.generate(
        {
          system: systemPrompt(obs.self.name, traits),
          user: userPrompt(obs, shown, this.memory.get(obs.self.id) ?? [], mk.costPerDay),
          schema: answerSchema(keys),
        },
        controller.signal,
      );
      this.s.inputTokens += res.inputTokens;
      this.s.outputTokens += res.outputTokens;
      this.s.estimatedUsd += costUsd(this.opts.client.model, res.inputTokens, res.outputTokens);
      const answer = parseAnswer(res.text, keys);
      if (!answer) {
        this.s.invalid++;
        return { error: "unreadable answer" };
      }
      this.s.ok++;
      return { answer, shown: shown.map((o) => ({ key: o.key, income: Math.round(o.income) })) };
    } catch (err) {
      const aborted = controller.signal.aborted;
      if (aborted) this.s.timedOut++;
      else this.s.failed++;
      const msg = aborted ? `timed out after ${this.opts.timeoutMs}ms` : (err as Error).message;
      this.s.lastError = msg;
      return { error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Turns a chosen option (and any money moves) into an intent, with the code's safety limits. */
  private intentFrom(obs: Observation, options: Option[], key: string, answer: LlmAnswer | undefined, trace: LlmTrace): Intent {
    const option = options.find((o) => o.key === key)!;
    const me = obs.self;
    const mk = market(obs);
    const plan = planTrades(obs, mk, option.cls, traitsOf(me.traits).personality);
    const intent: Intent = { action: option.action, ...plan, reason: trace.thought ? `${option.label}: ${trace.thought}` : option.label, trace };
    if (answer) {
      // The model decides; the code keeps it solvent.
      const floor = 5 * mk.costPerDay;
      const spend = Math.min(answer.spend, me.cash - floor, worth(obs, mk) - floor);
      if (spend >= 1) intent.spendOnComforts = Math.floor(spend);
      if (answer.borrow > 0 && obs.bank.lending && obs.bank.myLimit > 0) intent.borrow = Math.min(answer.borrow, obs.bank.myLimit);
      if (answer.repay > 0 && me.debt > 0) intent.repay = Math.min(answer.repay, me.debt, me.cash);
    }
    return intent;
  }

  private remember(obs: Observation): void {
    if (obs.shift === 0) return;
    const id = obs.self.id;
    const mem = this.memory.get(id) ?? [];
    const thought = this.lastThought.get(id);
    mem.push({
      shift: obs.shift - 1,
      did: obs.self.lastAction,
      earned: obs.self.lastIncome,
      thought: thought && thought.shift === obs.shift - 1 ? thought.thought : undefined,
    });
    if (mem.length > 8) mem.shift();
    this.memory.set(id, mem);
  }
}

/** The best-paying options, plus always resting, your current job and building. */
function menu(obs: Observation, all: Option[], max: number): Option[] {
  const must = all.filter((o) => o.cls === "rest" || o.cls === "build" || (o.cls === "work" && obs.self.employment && o.key === `work:${obs.self.employment.jobId}`));
  const rest = all.filter((o) => !must.includes(o)).sort((a, b) => b.income - a.income);
  return [...must, ...rest].slice(0, Math.max(max, must.length));
}
