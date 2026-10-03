// "Is the economy healthy?" Checks a run's metrics against the PRD's balance targets.
// Catches the two failure modes: crashing (starvation, inequality, dead markets) and
// going flat (no price movement, everyone in one job).

import { ACTION_TYPES, GOODS, type ShiftMetrics } from "@motherlode/shared";

export interface BalanceCheck {
  name: string;
  value: number;
  target: string;
  pass: boolean;
  /** Soft checks are reported but don't fail the run. */
  soft?: boolean;
}

export interface BalanceReport {
  pass: boolean;
  checks: BalanceCheck[];
}

export function balanceReport(metrics: ShiftMetrics[]): BalanceReport {
  const checks: BalanceCheck[] = [];
  const add = (name: string, value: number, target: string, pass: boolean, soft = false) =>
    checks.push({ name, value: Math.round(value * 1000) / 1000, target, pass, soft });
  if (metrics.length === 0) return { pass: false, checks: [{ name: "has data", value: 0, target: "> 0 shifts", pass: false }] };

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const warm = metrics.slice(Math.min(20, Math.floor(metrics.length / 5)));

  add("mean hungry share", mean(warm.map((m) => m.hungryFrac)), "< 0.10", mean(warm.map((m) => m.hungryFrac)) < 0.1);
  const peakHungry = Math.max(...warm.map((m) => m.hungryFrac));
  add("peak hungry share", peakHungry, "<= 0.50", peakHungry <= 0.5);
  add("mean starving share", mean(warm.map((m) => m.starvingFrac)), "< 0.03", mean(warm.map((m) => m.starvingFrac)) < 0.03);

  // Gold is rare by design (veins run out until a gold rush), so its market checks are soft.
  const soft = (g: string) => g === "gold";

  // Markets alive: each good trades on >= 70% of days, and never goes dead for 20+ days.
  for (const g of GOODS) {
    const days = new Map<number, boolean>();
    for (const m of warm) days.set(m.day, (days.get(m.day) ?? false) || m.volume[g] > 0);
    const traded = [...days.values()];
    const share = traded.filter(Boolean).length / Math.max(1, traded.length);
    add(`${g} trades on share of days`, share, ">= 0.70", share >= 0.7, soft(g));
    let streak = 0;
    let longest = 0;
    for (const t of traded) {
      streak = t ? 0 : streak + 1;
      longest = Math.max(longest, streak);
    }
    add(`${g} longest dead market (days)`, longest, "<= 20", longest <= 20, soft(g));
  }

  // Not flat: prices actually move.
  for (const g of GOODS) {
    const ps = warm.map((m) => m.prices[g]);
    const mu = mean(ps);
    const cv = mu > 0 ? Math.sqrt(mean(ps.map((p) => (p - mu) ** 2))) / mu : 0;
    add(`${g} price variation (CV)`, cv, ">= 0.02", cv >= 0.02, soft(g));
  }

  // Not flat: no one activity takes over 60% of miners for more than 10 days running.
  let worstStreak = 0;
  for (const a of ACTION_TYPES) {
    let streak = 0;
    for (const m of warm) {
      streak = m.activity[a] / Math.max(1, m.population) > 0.6 ? streak + 1 : 0;
      worstStreak = Math.max(worstStreak, streak);
    }
  }
  add("longest single-activity takeover (days)", worstStreak / 2, "<= 10", worstStreak / 2 <= 10);
  const kinds = mean(warm.map((m) => ACTION_TYPES.filter((a) => m.activity[a] > 0).length));
  add("mean distinct activities per shift", kinds, ">= 4", kinds >= 4);

  // Inequality in a band: some winners and losers, nobody owns everything.
  const tail = metrics.slice(-Math.max(1, Math.floor(metrics.length / 5)));
  const g = mean(tail.map((m) => m.gini));
  add("wealth Gini (final fifth)", g, "0.08 - 0.70", g >= 0.08 && g <= 0.7);

  // Credit: some defaults (risk is real), not a wave of them.
  const issued = metrics.reduce((a, m) => a + m.debt.issuedToday, 0);
  const defaults = metrics.reduce((a, m) => a + m.debt.defaultsToday, 0);
  const rate = issued ? defaults / issued : 0;
  add("default rate", rate, "< 0.20", rate < 0.2);
  add("loans issued", issued, "> 0", issued > 0, true);

  // Money neither vanishes nor explodes.
  const m0 = metrics[0].money.total;
  const m1 = metrics[metrics.length - 1].money.total;
  add("money supply growth (x)", m1 / Math.max(1, m0), "0.5 - 4", m1 / m0 >= 0.5 && m1 / m0 <= 4);
  add("mean well-being (final fifth)", mean(tail.map((m) => m.meanWellbeing)), "> 0.4", mean(tail.map((m) => m.meanWellbeing)) > 0.4);

  return { pass: checks.every((c) => c.pass || c.soft), checks };
}
