// Bookkeeping. Every coin and unit moves through these four functions:
//   transfer  - between two holders inside the valley (totals unchanged)
//   create    - enters the valley (production, imports, boons); the ledger expects it
//   destroy   - leaves the valley (eating, fuel, spoilage, exports); the ledger expects it
// The invariant check then compares the ledger with what everyone actually holds.

import { GOODS, emptyInventory, type Good, type Inventory, type WorldEvent } from "@motherlode/shared";
import type { Holder, WorldState } from "./world";

export type Asset = Good | "cash";

export function holding(h: Holder, asset: Asset): number {
  return asset === "cash" ? h.cash : h.inventory[asset];
}

function add(h: Holder, asset: Asset, qty: number): void {
  if (asset === "cash") h.cash += qty;
  else h.inventory[asset] += qty;
}

function assertQty(qty: number): void {
  if (!Number.isInteger(qty) || qty < 0) throw new Error(`books: quantity must be a non-negative integer, got ${qty}`);
}

export function transfer(from: Holder, to: Holder, asset: Asset, qty: number): void {
  assertQty(qty);
  if (holding(from, asset) < qty) throw new Error(`books: transfer of ${qty} ${asset} exceeds holding ${holding(from, asset)}`);
  add(from, asset, -qty);
  add(to, asset, qty);
}

export function create(state: WorldState, to: Holder, asset: Asset, qty: number): void {
  assertQty(qty);
  add(to, asset, qty);
  if (asset === "cash") state.ledger.cash += qty;
  else state.ledger.goods[asset] += qty;
}

export function destroy(state: WorldState, from: Holder, asset: Asset, qty: number): void {
  assertQty(qty);
  if (holding(from, asset) < qty) throw new Error(`books: destroying ${qty} ${asset} exceeds holding ${holding(from, asset)}`);
  add(from, asset, -qty);
  if (asset === "cash") state.ledger.cash -= qty;
  else state.ledger.goods[asset] -= qty;
}

/** Per-shift flow counters that feed the metrics. */
export interface Tally {
  output: Inventory;
  consumed: Inventory;
  imports: Inventory;
  exports: Inventory;
  exportRevenue: number;
  importSpend: number;
  comfortSpend: number;
  loansIssued: number;
  defaults: number;
}

export function newTally(): Tally {
  return {
    output: emptyInventory(),
    consumed: emptyInventory(),
    imports: emptyInventory(),
    exports: emptyInventory(),
    exportRevenue: 0,
    importSpend: 0,
    comfortSpend: 0,
    loansIssued: 0,
    defaults: 0,
  };
}

/** Collects this shift's events with run-unique ids. */
export class EventLog {
  readonly events: WorldEvent[] = [];
  constructor(private readonly shift: number) {}

  emit(e: Omit<WorldEvent, "id" | "shift">): WorldEvent {
    const event: WorldEvent = { id: `${this.shift}:${this.events.length}`, shift: this.shift, ...e };
    this.events.push(event);
    return event;
  }
}

/** Checks the books. Returns a list of problems (empty when everything balances). */
export function checkInvariants(state: WorldState): string[] {
  const problems: string[] = [];
  let cash = state.bank.cash + state.treasury.cash;
  const goods = emptyInventory();
  const holders: [string, Holder][] = [
    ["bank", state.bank],
    ["treasury", state.treasury],
    ...state.miners.map((m) => [m.id, m] as [string, Holder]),
  ];
  for (const [id, h] of holders) {
    if (h.cash < 0 || !Number.isInteger(h.cash)) problems.push(`${id} has invalid cash ${h.cash}`);
    for (const g of GOODS) {
      if (h.inventory[g] < 0 || !Number.isInteger(h.inventory[g])) problems.push(`${id} has invalid ${g} ${h.inventory[g]}`);
    }
  }
  for (const m of state.miners) {
    cash += m.cash;
    for (const g of GOODS) goods[g] += m.inventory[g];
  }
  for (const g of GOODS) goods[g] += state.bank.inventory[g] + state.treasury.inventory[g];
  if (cash !== state.ledger.cash) problems.push(`money doesn't balance: held ${cash}, books say ${state.ledger.cash}`);
  for (const g of GOODS) {
    if (goods[g] !== state.ledger.goods[g]) problems.push(`${g} doesn't balance: held ${goods[g]}, books say ${state.ledger.goods[g]}`);
  }
  for (const l of state.bank.loans) {
    if (l.balance < 0 || !Number.isInteger(l.balance)) problems.push(`loan ${l.id} has invalid balance ${l.balance}`);
  }
  return problems;
}
