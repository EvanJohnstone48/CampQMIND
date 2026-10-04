import { describe, expect, it } from "vitest";
import type { Slot } from "../src/types.js";
import { checkRewording } from "../src/verify.js";

const slots: Record<string, Slot> = {
  metric: { kind: "text", text: "the gold price" },
  usual: { kind: "number", value: 12, format: "coins" },
  now: { kind: "number", value: 9, format: "coins" },
};
const original = "Likely caused by your gold rush. {{metric}} went from a usual {{usual}} to {{now}}.";

describe("checkRewording", () => {
  it("passes a faithful rewording", () => {
    expect(checkRewording(original, "{{metric}} dropped from a usual {{usual}} to {{now}}, likely because of your gold rush.", slots)).toEqual([]);
  });

  it("rejects a number the model wrote itself", () => {
    expect(checkRewording(original, "Likely your gold rush. {{metric}} fell 25% from {{usual}} to {{now}}.", slots)).not.toEqual([]);
  });

  it("rejects spelled-out numbers", () => {
    expect(checkRewording(original, "Likely your gold rush. {{metric}} fell by half, from {{usual}} to {{now}}.", slots)).not.toEqual([]);
  });

  it("rejects dropped, added or unknown placeholders", () => {
    expect(checkRewording(original, "Likely your gold rush. {{metric}} fell to {{now}}.", slots)).not.toEqual([]);
    expect(checkRewording(original, "Likely your gold rush. {{metric}} fell from {{usual}} to {{now}}, {{now}}.", slots)).not.toEqual([]);
    expect(checkRewording(original, "Likely your gold rush. {{metric}} fell from {{usual}} to {{later}}.", slots)).not.toEqual([]);
  });

  it("rejects sounding more sure", () => {
    expect(checkRewording(original, "Your gold rush definitely caused this: {{metric}} went from {{usual}} to {{now}}. Likely.", slots)).not.toEqual([]);
    expect(checkRewording(original, "Clearly your gold rush. {{metric}} went from {{usual}} to {{now}}, likely.", slots)).not.toEqual([]);
  });

  it("rejects dropping the confidence word", () => {
    expect(checkRewording(original, "Your gold rush did it. {{metric}} went from {{usual}} to {{now}}.", slots)).not.toEqual([]);
  });
});
