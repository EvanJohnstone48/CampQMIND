// A uniform-price call auction: once per good per shift, everyone who trades gets the same price.
// Pure function, no world state: orders in, price and fills out.

import type { Rng } from "@motherlode/shared";

export interface AuctionOrder {
  participantId: string;
  side: "buy" | "sell";
  qty: number;
  /** Buy: max price. Sell: min price. */
  limit: number;
}

export interface AuctionFill {
  participantId: string;
  side: "buy" | "sell";
  qty: number;
}

export interface AuctionResult {
  /** Clearing price. Equals lastPrice when nothing trades. */
  price: number;
  volume: number;
  fills: AuctionFill[];
  bestBid?: number;
  bestAsk?: number;
}

/**
 * Picks the price that trades the most units. Ties go to the smallest imbalance between
 * demand and supply, then to the price nearest last shift's, then to the lower price.
 * Orders at the same limit are filled in a seeded random order, so nobody wins by id.
 */
export function clearAuction(orders: AuctionOrder[], lastPrice: number, rng: Rng): AuctionResult {
  const live = orders.filter((o) => o.qty > 0 && Number.isFinite(o.limit));
  const bids = live.filter((o) => o.side === "buy");
  const asks = live.filter((o) => o.side === "sell");
  const bestBid = bids.length ? Math.max(...bids.map((o) => o.limit)) : undefined;
  const bestAsk = asks.length ? Math.min(...asks.map((o) => o.limit)) : undefined;
  const none: AuctionResult = { price: lastPrice, volume: 0, fills: [], bestBid, bestAsk };
  if (bestBid === undefined || bestAsk === undefined || bestBid < bestAsk) return none;

  const candidates = new Set<number>(live.map((o) => o.limit));
  if (lastPrice >= bestAsk && lastPrice <= bestBid) candidates.add(lastPrice);

  const evaluate = (p: number) => {
    let demand = 0;
    let supply = 0;
    for (const o of bids) if (o.limit >= p) demand += o.qty;
    for (const o of asks) if (o.limit <= p) supply += o.qty;
    return { price: p, volume: Math.min(demand, supply), imbalance: Math.abs(demand - supply) };
  };
  const scored = [...candidates].filter((p) => p >= bestAsk && p <= bestBid).map(evaluate);
  let best: { price: number; volume: number; imbalance: number } | undefined;
  for (const c of scored) if (!best || better(c, best, lastPrice)) best = c;
  if (!best || best.volume === 0) return none;
  // When a whole range of prices clears equally well, use its midpoint (standard for call
  // auctions) so prices respond to both sides instead of sticking to last shift's.
  const ties = scored.filter((c) => c.volume === best!.volume && c.imbalance === best!.imbalance).map((c) => c.price);
  const mid = Math.round((Math.min(...ties) + Math.max(...ties)) / 2);
  const atMid = evaluate(mid);
  if (atMid.volume === best.volume && atMid.imbalance === best.imbalance) best = atMid;

  const rank = new Map<AuctionOrder, number>();
  rng.shuffle(live).forEach((o, i) => rank.set(o, i));
  const fill = (side: AuctionOrder[], eligible: (o: AuctionOrder) => boolean, byPrice: (a: AuctionOrder, b: AuctionOrder) => number) => {
    let left = best!.volume;
    const out: AuctionFill[] = [];
    for (const o of side.filter(eligible).sort((a, b) => byPrice(a, b) || rank.get(a)! - rank.get(b)!)) {
      if (left <= 0) break;
      const q = Math.min(o.qty, left);
      left -= q;
      out.push({ participantId: o.participantId, side: o.side, qty: q });
    }
    return out;
  };
  const p = best.price;
  const fills = [
    ...fill(bids, (o) => o.limit >= p, (a, b) => b.limit - a.limit),
    ...fill(asks, (o) => o.limit <= p, (a, b) => a.limit - b.limit),
  ];
  return { price: p, volume: best.volume, fills, bestBid, bestAsk };
}

function better(
  a: { price: number; volume: number; imbalance: number },
  b: { price: number; volume: number; imbalance: number },
  last: number,
): boolean {
  if (a.volume !== b.volume) return a.volume > b.volume;
  if (a.imbalance !== b.imbalance) return a.imbalance < b.imbalance;
  const da = Math.abs(a.price - last);
  const db = Math.abs(b.price - last);
  if (da !== db) return da < db;
  return a.price < b.price;
}
