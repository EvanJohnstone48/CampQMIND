import { describe, expect, it } from "vitest";
import { keyedRng } from "@motherlode/shared";
import { clearAuction, type AuctionOrder } from "./market";

const rng = () => keyedRng("test", 0, "auction");
const buy = (id: string, qty: number, limit: number): AuctionOrder => ({ participantId: id, side: "buy", qty, limit });
const sell = (id: string, qty: number, limit: number): AuctionOrder => ({ participantId: id, side: "sell", qty, limit });
const filled = (r: ReturnType<typeof clearAuction>, id: string) => r.fills.filter((f) => f.participantId === id).reduce((a, f) => a + f.qty, 0);

describe("uniform-price call auction", () => {
  it("does nothing when bids and asks don't cross", () => {
    const r = clearAuction([buy("a", 5, 10), sell("b", 5, 12)], 11, rng());
    expect(r.volume).toBe(0);
    expect(r.price).toBe(11);
    expect(r.fills).toEqual([]);
    expect(r.bestBid).toBe(10);
    expect(r.bestAsk).toBe(12);
  });

  it("keeps the last price when one side is empty", () => {
    expect(clearAuction([buy("a", 5, 10)], 7, rng()).price).toBe(7);
    expect(clearAuction([], 7, rng()).volume).toBe(0);
  });

  it("trades the maximum volume at one price for everyone", () => {
    const orders = [buy("a", 3, 20), buy("b", 3, 15), buy("c", 3, 10), sell("x", 4, 8), sell("y", 4, 14)];
    const r = clearAuction(orders, 12, rng());
    expect(r.volume).toBe(6);
    expect(r.price).toBeGreaterThanOrEqual(14);
    expect(r.price).toBeLessThanOrEqual(15);
    expect(filled(r, "a")).toBe(3);
    expect(filled(r, "b")).toBe(3);
    expect(filled(r, "c")).toBe(0);
    expect(filled(r, "x") + filled(r, "y")).toBe(6);
  });

  it("never fills a buyer above their limit or a seller below theirs", () => {
    const orders = [buy("a", 10, 30), buy("b", 2, 25), sell("x", 5, 20), sell("y", 5, 28), sell("z", 5, 35)];
    const r = clearAuction(orders, 25, rng());
    for (const f of r.fills) {
      const o = orders.find((x) => x.participantId === f.participantId)!;
      if (o.side === "buy") expect(r.price).toBeLessThanOrEqual(o.limit);
      else expect(r.price).toBeGreaterThanOrEqual(o.limit);
      expect(f.qty).toBeLessThanOrEqual(o.qty);
    }
    const bought = r.fills.filter((f) => f.side === "buy").reduce((a, f) => a + f.qty, 0);
    const sold = r.fills.filter((f) => f.side === "sell").reduce((a, f) => a + f.qty, 0);
    expect(bought).toBe(r.volume);
    expect(sold).toBe(r.volume);
  });

  it("picks the middle of an equally good price range", () => {
    // One buyer at 20, one seller at 10: any price 10..20 trades 1 unit.
    const r = clearAuction([buy("a", 1, 20), sell("b", 1, 10)], 100, rng());
    expect(r.volume).toBe(1);
    expect(r.price).toBe(15);
  });

  it("rations equal-price orders in a seeded, repeatable order", () => {
    const orders = [buy("a", 5, 10), buy("b", 5, 10), sell("x", 5, 10)];
    const r1 = clearAuction(orders, 10, keyedRng("s", 1, "auction"));
    const r2 = clearAuction(orders, 10, keyedRng("s", 1, "auction"));
    expect(r1).toEqual(r2);
    expect(filled(r1, "a") + filled(r1, "b")).toBe(5);
  });

  it("partially fills the marginal order", () => {
    const r = clearAuction([buy("a", 10, 50), sell("x", 4, 30)], 40, rng());
    expect(r.volume).toBe(4);
    expect(filled(r, "a")).toBe(4);
  });
});
