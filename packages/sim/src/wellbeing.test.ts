import { describe, expect, it } from "vitest";
import type { Needs } from "@motherlode/shared";
import { needUtility, security, wellbeing } from "./wellbeing";

const content: Needs = { nourishment: 0.8, energy: 0.8, shelter: 0.6, health: 0.7, security: 0.5, comfort: 0.3 };

describe("well-being", () => {
  it("has diminishing returns: the first gains matter most", () => {
    const low = needUtility(0.2) - needUtility(0.1);
    const high = needUtility(0.9) - needUtility(0.8);
    expect(low).toBeGreaterThan(high * 2);
    expect(needUtility(0)).toBe(0);
    expect(needUtility(1)).toBeCloseTo(1);
  });

  it("an extra coin is worth less to the rich than to the poor", () => {
    const perDay = 50;
    const poorGain = security(300 + 100, perDay) - security(300, perDay);
    const richGain = security(3000 + 100, perDay) - security(3000, perDay);
    expect(poorGain).toBeGreaterThan(richGain * 5);
  });

  it("puts hunger first: starving outweighs everything else being perfect", () => {
    const starving = wellbeing({ ...content, nourishment: 0, energy: 1, shelter: 1, security: 1, comfort: 1 });
    const modest = wellbeing({ ...content, nourishment: 0.6, energy: 0.4, shelter: 0.15, security: 0.1, comfort: 0 });
    expect(modest).toBeGreaterThan(starving);
  });

  it("rises with every need", () => {
    for (const k of Object.keys(content) as (keyof Needs)[]) {
      expect(wellbeing({ ...content, [k]: Math.min(1, content[k] + 0.2) })).toBeGreaterThan(wellbeing(content));
    }
  });

  it("adds the social term from Lane 2", () => {
    expect(wellbeing(content, 0.1)).toBeCloseTo(wellbeing(content) + 0.1);
  });

  it("treats debt-laden miners as insecure", () => {
    expect(security(-500, 50)).toBe(0);
  });
});
