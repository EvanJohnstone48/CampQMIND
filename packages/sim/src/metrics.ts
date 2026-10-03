// The per-shift time series: what Lane 3's signals and Lane 4's charts are built from.

import { ACTION_TYPES, GOODS, type ActionType, type Good, type ShiftMetrics } from "@motherlode/shared";
import { bankRate, minerDebt } from "./bank";
import type { Tally } from "./books";
import { netWorth } from "./wellbeing";
import { dayOf, type WorldState } from "./world";

export function computeMetrics(state: WorldState, shift: number, actions: ActionType[], tally: Tally): ShiftMetrics {
  const n = state.miners.length || 1;
  const prices = {} as Record<Good, number>;
  const volume = {} as Record<Good, number>;
  const worldPrices = {} as Record<Good, number>;
  for (const g of GOODS) {
    prices[g] = state.prices[g].last;
    volume[g] = state.prices[g].volume;
    worldPrices[g] = Math.round(state.worldPrices[g] * 100) / 100;
  }
  const activity = Object.fromEntries(ACTION_TYPES.map((a) => [a, 0])) as Record<ActionType, number>;
  for (const a of actions) activity[a]++;

  const minersCash = state.miners.reduce((a, m) => a + m.cash, 0);
  const worths = state.miners.map((m) => Math.max(0, netWorth(m.cash, m.inventory, minerDebt(state, m.id), prices)));
  const day = dayOf(shift);
  const totalDebt = state.bank.loans.reduce((a, l) => a + l.balance, 0);
  const forestCap = state.forests.reduce((a, f) => a + f.capacity, 0) || 1;

  return {
    shift,
    day,
    prices,
    volume,
    output: { ...tally.output },
    consumed: { ...tally.consumed },
    imports: { ...tally.imports },
    exports: { ...tally.exports },
    worldPrices,
    money: {
      total: minersCash + state.bank.cash + state.treasury.cash,
      miners: minersCash,
      bank: state.bank.cash,
      treasury: state.treasury.cash,
      exportRevenue: tally.exportRevenue,
      importSpend: tally.importSpend,
      comfortSpend: tally.comfortSpend,
    },
    debt: {
      total: totalDebt,
      loans: state.bank.loans.length,
      issuedToday: tally.loansIssued,
      defaultsToday: tally.defaults,
      ratePerDay: Math.round(bankRate(state) * 10000) / 10000,
      lending: state.bank.lending,
    },
    population: state.miners.length,
    hungryFrac: frac(state.miners.filter((m) => m.needs.nourishment < 0.3).length, n),
    starvingFrac: frac(state.miners.filter((m) => m.needs.nourishment <= 0).length, n),
    injuredFrac: frac(state.miners.filter((m) => m.collapsed || shift + 1 < m.injuredUntilShift).length, n),
    roughSleepersFrac: frac(state.miners.filter((m) => m.homeKind === "rough").length, n),
    housedFrac: frac(state.miners.filter((m) => m.homeKind === "house").length, n),
    employed: actions.filter((a) => a === "work").length,
    activity,
    meanWellbeing: Math.round((state.miners.reduce((a, m) => a + m.wellbeing, 0) / n) * 10000) / 10000,
    gini: Math.round(gini(worths) * 10000) / 10000,
    forestFraction: Math.round((state.forests.reduce((a, f) => a + f.stock, 0) / forestCap) * 10000) / 10000,
    veinRemaining: Object.fromEntries(state.veins.map((v) => [v.siteId, Math.round((1 - v.extracted / v.tonnage) * 10000) / 10000])),
  };
}

export function gini(values: number[]): number {
  const xs = values.filter((x) => x >= 0).sort((a, b) => a - b);
  const total = xs.reduce((a, b) => a + b, 0);
  if (xs.length === 0 || total === 0) return 0;
  let weighted = 0;
  xs.forEach((x, i) => (weighted += (i + 1) * x));
  return (2 * weighted) / (xs.length * total) - (xs.length + 1) / xs.length;
}

function frac(k: number, n: number): number {
  return Math.round((k / n) * 10000) / 10000;
}
