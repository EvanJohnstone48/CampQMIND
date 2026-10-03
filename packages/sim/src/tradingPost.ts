// The Trading Post: the valley's only link to the outside world, and the main balancing lever.
//
// It buys copper and gold on a downward-sloping curve (sell too much in one shift and the
// price steps down for everyone), buys surplus food and timber cheaply, and sells imports
// at a markup. That gives metals a reason to be worth something, puts a ceiling on staple
// prices (famine is expensive but survivable) and a floor under them (gluts don't hit zero).

import type { Good, Rng } from "@motherlode/shared";
import type { Dials } from "./dials";
import type { AuctionOrder } from "./market";

export const TRADING_POST_ID = "tradingPost";

/** Effectively unlimited, but finite so arithmetic stays safe. */
const BOTTOMLESS = 1_000_000;

const BID_TIERS = [1, 0.85, 0.7, 0.55];

/** The outside world buys raw copper ore too, but cheaply: a fifth of the copper price per unit. */
export const ORE_FACTOR = 0.2;

export function tradingPostOrders(good: Good, worldPrice: number, dials: Dials): AuctionOrder[] {
  if (worldPrice <= 0) return [];
  if (good === "copperOre") {
    // Ore is bought (never sold) at a flat floor, so digging always pays something.
    return [{ participantId: TRADING_POST_ID, side: "buy", qty: BOTTOMLESS, limit: Math.max(1, Math.floor(worldPrice)) }];
  }
  const markup = dials.importMarkup;
  const orders: AuctionOrder[] = [];
  const isMetal = good === "copper" || good === "gold";
  const bidBase = isMetal ? worldPrice : worldPrice / markup;
  const depth = isMetal ? (good === "gold" ? Math.max(1, Math.round(dials.exportDepth / 4)) : dials.exportDepth) : dials.exportDepth * 2;
  BID_TIERS.forEach((t, i) => {
    const qty = i === BID_TIERS.length - 1 ? BOTTOMLESS : depth;
    orders.push({ participantId: TRADING_POST_ID, side: "buy", qty, limit: Math.max(1, Math.floor(bidBase * t)) });
  });
  orders.push({ participantId: TRADING_POST_ID, side: "sell", qty: BOTTOMLESS, limit: importPrice(worldPrice, dials) });
  return orders;
}

export function importPrice(worldPrice: number, dials: Dials): number {
  return Math.max(1, Math.ceil(worldPrice * dials.importMarkup));
}

/** The best price the Trading Post pays for one unit right now. */
export function exportPrice(good: Good, worldPrice: number, dials: Dials): number {
  if (good === "copperOre") return Math.max(1, Math.floor(worldPrice));
  const isMetal = good === "copper" || good === "gold";
  return Math.max(1, Math.floor(isMetal ? worldPrice : worldPrice / dials.importMarkup));
}

/** Outside prices wander on a slow mean-reverting walk around the dial values. */
export function driftWorldPrice(current: number, base: number, volatility: number, rng: Rng): number {
  if (base <= 0) return 0;
  const pulled = current + 0.05 * (base - current);
  const next = pulled * (1 + volatility * rng.normal());
  return Math.max(base * 0.2, Math.min(base * 5, next));
}
