// The bank lends only from finite reserves: no deposits, no money creation.
// As reserves fall it charges more and lends less; below the freeze point it stops.
// So credit freezes emerge on their own, which gives the narrator something real to explain.

import { GOODS } from "@motherlode/shared";
import { transfer, type EventLog, type Tally } from "./books";
import type { Loan, MinerState, WorldState } from "./world";
import { netWorth } from "./wellbeing";

export const TOWN_ID = "town";

export function reserveRatio(state: WorldState): number {
  return state.bank.cash / Math.max(1, state.bank.initialReserves);
}

/** Daily rate on new loans: base rate, rising up to 3x as reserves fall below half. */
export function bankRate(state: WorldState): number {
  const r = reserveRatio(state);
  const tight = r >= 0.5 ? 1 : 1 + 4 * (0.5 - r);
  return state.dials.interestRate * tight;
}

export function minerDebt(state: WorldState, minerId: string): number {
  let d = 0;
  for (const l of state.bank.loans) if (l.borrowerId === minerId) d += l.balance;
  return d;
}

export function ownsHouse(state: WorldState, minerId: string): string | undefined {
  return state.lots.find((l) => l.ownerId === minerId && l.complete)?.siteId;
}

/** How much more this miner may borrow right now. */
export function loanLimit(state: WorldState, m: MinerState): number {
  const day = Math.floor(state.shift / 2);
  if (!state.bank.lending || m.creditBarredUntilDay > day) return 0;
  const prices = Object.fromEntries(GOODS.map((g) => [g, state.prices[g].last])) as Record<(typeof GOODS)[number], number>;
  const debt = minerDebt(state, m.id);
  const worth = netWorth(m.cash, m.inventory, debt, prices);
  const avgIncome = m.incomeHistory.length ? m.incomeHistory.reduce((a, b) => a + b, 0) / m.incomeHistory.length : 0;
  const house = ownsHouse(state, m.id) ? 300 : 0;
  // No income and nothing to pledge: no loan. (Keeps the bank sane whatever the brains ask for.)
  if (m.incomeHistory.length >= 3 && avgIncome < 10 && !house) return 0;
  const personal = state.dials.baseLoanLimit + 0.3 * Math.max(0, worth) + 4 * avgIncome + house - debt;
  const available = state.bank.cash - Math.ceil(state.dials.freezeReserveFraction * state.bank.initialReserves);
  return Math.max(0, Math.floor(Math.min(personal, available)));
}

export function updateLending(state: WorldState, log: EventLog): void {
  const open = reserveRatio(state) > state.dials.freezeReserveFraction;
  if (open !== state.bank.lending) {
    state.bank.lending = open;
    log.emit({
      kind: open ? "credit-thaw" : "credit-freeze",
      data: { reserves: state.bank.cash, ratio: round3(reserveRatio(state)) },
      causes: ["dial:freezeReserveFraction"],
      text: open ? "The bank is lending again." : "The bank has stopped lending.",
    });
  }
}

export function requestLoan(state: WorldState, m: MinerState, amount: number, log: EventLog, tally: Tally): void {
  const want = Math.floor(amount);
  if (!(want > 0)) return;
  const limit = loanLimit(state, m);
  const grant = Math.min(want, limit);
  if (grant <= 0) {
    log.emit({ kind: "loan-denied", actors: [m.id], data: { asked: want, limit }, text: `${m.name} was refused a loan.` });
    return;
  }
  const loan: Loan = {
    id: `L${state.bank.nextLoanId++}`,
    borrowerId: m.id,
    principal: grant,
    balance: grant,
    ratePerDay: round4(bankRate(state)),
    termDays: state.dials.loanTermDays,
    issuedDay: Math.floor(state.shift / 2),
    missed: 0,
    collateralSiteId: ownsHouse(state, m.id),
  };
  state.bank.loans.push(loan);
  transfer(state.bank, m, "cash", grant);
  tally.loansIssued++;
  log.emit({ kind: "loan-issued", actors: [m.id], data: { loanId: loan.id, amount: grant, ratePerDay: loan.ratePerDay }, text: `${m.name} borrowed ${grant}.` });
}

export function repayExtra(state: WorldState, m: MinerState, amount: number, log: EventLog): void {
  let left = Math.min(Math.floor(amount), m.cash);
  for (const loan of state.bank.loans.filter((l) => l.borrowerId === m.id)) {
    if (left <= 0) break;
    const pay = Math.min(left, loan.balance);
    transfer(m, state.bank, "cash", pay);
    loan.balance -= pay;
    left -= pay;
  }
  closeRepaid(state, log);
}

export function installment(loan: Loan): number {
  return Math.ceil(loan.principal / loan.termDays);
}

/**
 * End of day: interest accrues, installments are auto-debited, missed payments counted,
 * and loans with too many consecutive misses default.
 */
export function bankDayEnd(state: WorldState, minersById: Map<string, MinerState>, log: EventLog, tally: Tally): void {
  const day = Math.floor(state.shift / 2);
  for (const loan of [...state.bank.loans]) {
    const m = minersById.get(loan.borrowerId)!;
    loan.balance += Math.ceil(loan.balance * loan.ratePerDay);
    if (day <= loan.issuedDay) continue;
    const due = Math.min(loan.balance, installment(loan) + Math.ceil(loan.principal * loan.ratePerDay));
    const pay = Math.min(due, m.cash);
    transfer(m, state.bank, "cash", pay);
    loan.balance -= pay;
    if (pay < due) {
      loan.missed++;
      log.emit({ kind: "loan-missed", actors: [m.id], data: { loanId: loan.id, due, paid: pay, missed: loan.missed }, text: `${m.name} missed a loan payment.` });
      if (loan.missed >= state.dials.missedToDefault) foreclose(state, m, loan, log, tally);
    } else {
      loan.missed = 0;
    }
  }
  closeRepaid(state, log);
  sweepBankProfits(state);
}

function foreclose(state: WorldState, m: MinerState, loan: Loan, log: EventLog, tally: Tally): void {
  const seized: Record<string, number> = {};
  for (const g of GOODS) {
    if (g === "food") continue; // the bank leaves you your food
    const q = m.inventory[g];
    if (q > 0) {
      transfer(m, state.bank, g, q);
      seized[g] = q;
    }
  }
  const house = state.lots.find((l) => l.ownerId === m.id && l.complete);
  let houseSeized = false;
  if (house) {
    house.ownerId = TOWN_ID;
    houseSeized = true;
    if (m.homeSiteId === house.siteId) {
      m.homeSiteId = undefined;
      m.homeKind = "bunkhouse";
    }
    const salvage = Math.min(state.dials.houseSalvage, state.treasury.cash);
    transfer(state.treasury, state.bank, "cash", salvage);
  }
  const writtenOff = loan.balance;
  state.bank.loans = state.bank.loans.filter((l) => l !== loan);
  m.creditBarredUntilDay = Math.floor(state.shift / 2) + state.dials.creditBanDays;
  tally.defaults++;
  log.emit({
    kind: "loan-default",
    actors: [m.id],
    siteId: house?.siteId,
    data: { loanId: loan.id, writtenOff, houseSeized, ...seized },
    causes: ["dial:missedToDefault"],
    text: `${m.name} defaulted; the bank foreclosed.`,
  });
}

function closeRepaid(state: WorldState, log: EventLog): void {
  const done = state.bank.loans.filter((l) => l.balance <= 0);
  if (!done.length) return;
  state.bank.loans = state.bank.loans.filter((l) => l.balance > 0);
  for (const l of done) log.emit({ kind: "loan-repaid", actors: [l.borrowerId], data: { loanId: l.id, principal: l.principal } });
}

/** Profit far above starting reserves goes to the treasury, so interest doesn't drain money out of circulation. */
function sweepBankProfits(state: WorldState): void {
  const cap = Math.floor(state.bank.initialReserves * 1.2);
  if (state.bank.cash > cap) transfer(state.bank, state.treasury, "cash", state.bank.cash - cap);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
