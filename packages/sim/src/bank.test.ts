import { describe, expect, it } from "vitest";
import { EventLog, newTally, transfer } from "./books";
import { bankDayEnd, bankRate, loanLimit, minerDebt, requestLoan, updateLending } from "./bank";
import { PLACEHOLDER_MAP } from "./placeholderMap";
import { createWorld, type WorldState } from "./world";

function world(): WorldState {
  return createWorld({ seed: "bank", map: PLACEHOLDER_MAP, population: 5 }).state;
}

/** Runs the bank's end-of-day for `days` days. */
function days(state: WorldState, n: number, log = new EventLog(0)) {
  const byId = new Map(state.miners.map((m) => [m.id, m]));
  for (let i = 0; i < n; i++) {
    state.shift += 2;
    bankDayEnd(state, byId, log, newTally());
  }
  return log;
}

describe("bank", () => {
  it("lends, charges interest and gets repaid", () => {
    const state = world();
    state.shift = 1;
    const m = state.miners[0];
    const log = new EventLog(1);
    requestLoan(state, m, 200, log, newTally());
    expect(m.cash).toBe(600);
    expect(state.bank.cash).toBe(state.bank.initialReserves - 200);
    expect(log.events.some((e) => e.kind === "loan-issued")).toBe(true);

    const after = days(state, 40);
    expect(minerDebt(state, m.id)).toBe(0);
    expect(after.events.some((e) => e.kind === "loan-repaid")).toBe(true);
    // Interest means the bank got back more than it lent.
    expect(state.bank.cash).toBeGreaterThan(state.bank.initialReserves);
  });

  it("forecloses after too many missed payments and bans the borrower", () => {
    const state = world();
    state.shift = 1;
    const m = state.miners[0];
    m.inventory.copper = 3;
    requestLoan(state, m, 200, new EventLog(1), newTally());
    transfer(m, state.treasury, "cash", m.cash); // the miner blows it all

    const log = days(state, state.dials.missedToDefault + 1);
    expect(log.events.filter((e) => e.kind === "loan-missed").length).toBeGreaterThanOrEqual(state.dials.missedToDefault);
    const def = log.events.find((e) => e.kind === "loan-default");
    expect(def?.actors).toEqual([m.id]);
    expect(state.bank.loans).toHaveLength(0);
    expect(state.bank.inventory.copper).toBe(3);
    expect(m.inventory.copper).toBe(0);
    expect(m.creditBarredUntilDay).toBeGreaterThan(Math.floor(state.shift / 2));
    expect(loanLimit(state, m)).toBe(0);
  });

  it("charges more and then stops lending as reserves run low", () => {
    const state = world();
    const normal = bankRate(state);
    transfer(state.bank, state.treasury, "cash", Math.floor(state.bank.cash * 0.7));
    expect(bankRate(state)).toBeGreaterThan(normal);

    transfer(state.bank, state.treasury, "cash", Math.floor(state.bank.cash * 0.6));
    const log = new EventLog(0);
    updateLending(state, log);
    expect(state.bank.lending).toBe(false);
    expect(log.events[0].kind).toBe("credit-freeze");
    expect(loanLimit(state, state.miners[0])).toBe(0);
  });

  it("refuses loans beyond the limit", () => {
    const state = world();
    const m = state.miners[0];
    const limit = loanLimit(state, m);
    const log = new EventLog(0);
    requestLoan(state, m, limit * 10, log, newTally());
    expect(minerDebt(state, m.id)).toBe(limit);
  });
});
