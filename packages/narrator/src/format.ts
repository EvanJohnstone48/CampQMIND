import type { Slot } from "./types.js";

/** Turns a slot into the words shown on a card. The only place numbers become text. */
export function formatSlot(slot: Slot): string {
  if (slot.kind === "text") return slot.text;
  const v = slot.value;
  switch (slot.format) {
    case "share":
    case "percent": {
      // Below 10%, whole numbers hide real movement (5% → 6% could be 5.0% → 6.4%).
      const pct = Math.abs(v) * 100;
      return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
    }
    case "coins":
      return `${roundForReading(v)} coins`;
    case "count":
    case "round":
      return `${Math.round(v)}`;
    case "number":
      return `${roundForReading(v)}`;
    case "times":
      return `${parseFloat(v.toFixed(2))}`;
  }
}

/** One decimal for small values, whole numbers once they're big enough that decimals are noise. */
function roundForReading(v: number): string {
  return Math.abs(v) >= 100 ? `${Math.round(v)}` : v.toFixed(1);
}

const SLOT = /\{\{(\w+)\}\}/g;

export function slotNames(template: string): string[] {
  return [...template.matchAll(SLOT)].map((m) => m[1]);
}

export function render(template: string, slots: Record<string, Slot>): string {
  const text = template.replace(SLOT, (_, name: string) => {
    const slot = slots[name];
    if (!slot) throw new Error(`Template uses unknown slot {{${name}}}`);
    return formatSlot(slot);
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
