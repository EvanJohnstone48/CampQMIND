// Applies the Overseer's dials, acts of god and god powers at the start of a shift.

import { GOODS, keyedRng, type OverseerAction } from "@motherlode/shared";
import { create, destroy, type EventLog, type Tally } from "./books";
import { clampDial } from "./dials";
import type { MinerState, SimContext, WorldState } from "./world";

export function applyOverseer(ctx: SimContext, state: WorldState, actions: OverseerAction[], log: EventLog, tally: Tally): void {
  actions.forEach((a, i) => applyOne(ctx, state, a, i, log, tally));
}

function applyOne(ctx: SimContext, state: WorldState, a: OverseerAction, index: number, log: EventLog, tally: Tally): void {
  const s = state.shift;
  const rng = keyedRng(state.seed, s, "overseer", index);
  const everyone = state.miners.map((m) => m.id);

  if (a.type === "setDial") {
    const value = clampDial(a.key, a.value);
    if (value === undefined) return reject(log, `unknown dial "${a.key}"`);
    const from = state.dials[a.key];
    if (from === value) return;
    state.dials[a.key] = value;
    log.emit({ kind: "dial-changed", data: { key: a.key, from, to: value }, causes: [`dial:${a.key}`], text: `Overseer set ${a.key} from ${from} to ${value}.` });
    return;
  }

  if (a.type === "actOfGod") {
    const inRegion = (siteId: string) => !a.region || ctx.sites[siteId]?.region === a.region;
    switch (a.kind) {
      case "earthquake": {
        const magnitude = a.magnitude ?? 4;
        const ev = log.emit({ kind: "act-of-god", data: { act: "earthquake", region: a.region ?? null, magnitude }, witnesses: everyone, text: "The ground shakes." });
        state.modifiers.push({ kind: "earthquake", region: a.region, untilShift: s + 8, magnitude, sourceEventId: ev.id });
        for (const v of state.veins) if (inRegion(v.siteId)) v.supportedDepth = Math.max(0, v.supportedDepth - 2);
        return;
      }
      case "drought": {
        const magnitude = a.magnitude ?? 0.5;
        const ev = log.emit({ kind: "act-of-god", data: { act: "drought", region: a.region ?? null, magnitude }, witnesses: everyone, text: "The rains have stopped." });
        state.modifiers.push({ kind: "drought", region: a.region, untilShift: s + 12, magnitude, sourceEventId: ev.id });
        return;
      }
      case "forestFire": {
        const targets = a.region ? state.forests.filter((f) => inRegion(f.siteId)) : [rng.pick(state.forests)];
        const share = Math.min(1, Math.max(0, a.magnitude ?? 0.6));
        let burned = 0;
        for (const f of targets) {
          burned += f.stock * share;
          f.stock *= 1 - share;
        }
        log.emit({
          kind: "act-of-god",
          siteId: targets.length === 1 ? targets[0].siteId : undefined,
          data: { act: "forestFire", region: a.region ?? null, burned: Math.round(burned) },
          witnesses: everyone,
          text: "Fire tears through the forest.",
        });
        return;
      }
      case "goldRush": {
        const gold = state.veins.filter((v) => v.ore === "gold");
        const vein = (a.siteId && state.veins.find((v) => v.siteId === a.siteId)) || (gold.length ? rng.pick(gold) : undefined);
        if (!vein) return reject(log, "no vein for a gold rush");
        const units = 80;
        vein.tonnage += units;
        vein.exhausted = false;
        const ev = log.emit({ kind: "act-of-god", siteId: vein.siteId, data: { act: "goldRush", units }, witnesses: everyone, text: `Gold is found at ${ctx.sites[vein.siteId].name}!` });
        vein.pocket = { remaining: units, multiplier: a.magnitude ?? 4, sourceEventId: ev.id };
        log.emit({ kind: "rumour", siteId: vein.siteId, data: { about: "gold" }, causes: [ev.id], text: `Word spreads of rich gold at ${ctx.sites[vein.siteId].name}.` });
        return;
      }
      case "priceShock": {
        const good = a.good && a.good !== "copperOre" ? a.good : "copper";
        const magnitude = a.magnitude ?? 0.5;
        const from = state.worldPrices[good];
        state.worldPrices[good] = from * magnitude;
        log.emit({ kind: "act-of-god", good, data: { act: "priceShock", from: Math.round(from), to: Math.round(from * magnitude) }, text: `Outside ${good} prices jump to ${Math.round(from * magnitude)}.` });
        return;
      }
    }
  }

  if (a.type === "godPower") {
    const m = state.miners.find((x) => x.id === a.minerId);
    if (!m) return reject(log, `no miner "${a.minerId}"`);
    const witnesses = nearby(ctx, state, m);
    switch (a.kind) {
      case "lightning": {
        const lost: Record<string, number> = {};
        for (const g of GOODS) {
          const q = Math.floor(m.inventory[g] * state.dials.lightningDestroy);
          if (q > 0) {
            destroy(state, m, g, q);
            tally.consumed[g] += q;
            lost[g] = q;
          }
        }
        injure(m, s, state.dials.injuryShifts, 0.4);
        log.emit({ kind: "god-power", actors: [m.id], data: { power: "lightning", ...lost }, witnesses, text: `Lightning strikes ${m.name}.` });
        return;
      }
      case "boon": {
        const amount = Math.max(0, Math.floor(a.amount ?? state.dials.boonSize));
        create(state, m, "cash", amount);
        log.emit({ kind: "god-power", actors: [m.id], data: { power: "boon", amount }, witnesses, text: `${m.name} receives a windfall of ${amount}.` });
        return;
      }
      case "throw": {
        const lost: Record<string, number> = {};
        for (const g of ["food", "timber", "copperOre"] as const) {
          const q = m.inventory[g];
          if (q > 0) {
            destroy(state, m, g, q);
            tally.consumed[g] += q;
            lost[g] = q;
          }
        }
        m.injuredUntilShift = Math.max(m.injuredUntilShift, s + 2);
        log.emit({ kind: "god-power", actors: [m.id], data: { power: "throw", ...lost }, witnesses, text: `${m.name} is thrown into the river.` });
        return;
      }
    }
  }
}

export function injure(m: MinerState, shift: number, shifts: number, damage: number): void {
  m.needs.health = Math.max(0, m.needs.health - damage);
  m.injuredUntilShift = Math.max(m.injuredUntilShift, shift + 1 + shifts);
}

/** Miners close enough to see something happen to `m` (including `m`). */
export function nearby(ctx: SimContext, state: WorldState, m: MinerState): string[] {
  const radius = ctx.map.sightRadius ?? 40;
  const here = ctx.sites[m.location]?.position;
  if (!here) return [m.id];
  return state.miners
    .filter((o) => {
      const p = ctx.sites[o.location]?.position;
      return p && Math.hypot(p.x - here.x, p.z - here.z) <= radius;
    })
    .map((o) => o.id);
}

function reject(log: EventLog, why: string): void {
  log.emit({ kind: "invalid-intent", data: { source: "overseer", why }, text: `Overseer action ignored: ${why}` });
}
